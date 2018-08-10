const app = require('express')();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const moment = require('moment');
const mongoClient = require('mongodb').MongoClient;

const url = 'mongodb://127.0.0.1:27017'

let entries, users;
mongoClient.connect(url,{ useNewUrlParser: true } , (err, client) => {
  if (err) {
    console.log('db connection failure');
  } else {
    const db = client.db('chat');
    entries = db.collection('entries');
    users = db.collection('users');
  }
});

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

function now() {
  return moment().format('YYYY-MM-DD HH:mm:ss');
}

function appendMessage(user, content, date) {
  entries.insert({
    'name': user,
    'content': content,
    'date': date
  });
  users.insert({'name': user});
  let option = '';
  if (content == 'disconnected' || content == 'connected') {
    option = ' disabled';
    content = ' ' + content;
  }
  io.emit('chat message', user + content + ' at ' + date, option);
}


io.on('connection', (socket) => {
  let user_name = null;

  /* disconnected */
  socket.on('disconnect', () => {
    let date = now();
    appendMessage(user_name, 'disconnected', date);
    io.emit('delete user', user_name);
    users.remove({'name': user_name}, (err, result) => {
      if (err) {
        console.log(result);
      }
    });
  });

  /* when user submit a chat message */
  socket.on('chat message', (msg) => {
    if (msg != '') {
      let date = now();
      appendMessage(user_name, ': ' + msg, date);
    }
  });

  /* new user */
  socket.on('user in', (msg) => {
    /* show the list of the history of the chat messages only for myself */
    entries.find().toArray((err, documents) => {
      documents.reverse().some((doc, i) => {
        let option = '';
        if (doc.content == 'disconnected' ||  doc.content == 'connected') {
          option = ' disabled';
        }
        /* only for myself */
        io.to(socket.id).emit('history', doc.name + ' ' + doc.content + ' at ' + doc.date, option);
        /* up to 50 messages */
        if (i == 50) {
          return true;
        }
      });

      /* save the chat message (with user_name and data) to the database */
      let date = now();
      user_name = msg;
      appendMessage(user_name, 'connected', date);
    });

    /* list the active users */
    users.find().toArray((err, documents) => {
      documents.some((doc, i) => {
        /* only for myself */
        io.to(socket.id).emit('add user', doc.name);
      });
      /* nortify the other active users of my login */
      io.emit('add user', msg);
    });
  });
});


http.listen(3000, '127.0.0.1', () => {
  console.log('listening on 127.0.0.1:3000');
});

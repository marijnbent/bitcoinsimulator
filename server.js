const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const config = require('./api/config.js');
const compression = require('compression');
const Blockchain = require('./api/mongoschema/blockchainSchema');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');

app.use(compression());


app.use('/dist', express.static(__dirname + '/dist'));
app.use('/external', express.static(__dirname + '/external'));

app.use(bodyParser.json());

mongoose.connect(config.mongodb, { useNewUrlParser: true }).then(
  async() => {
    console.log('mongo ready');
    // create public blockchain in DB
    await new Blockchain({
      name: 'public',
      difficulty: 4,
      blockReward: 3.125,
      genesisReward: 3.125
    }).save();
  },
  err => { console.log(err); }
);

app.get('*', (req, res) => {
  res.sendFile(__dirname + '/dist/index.html');
});

http.listen(8080, async function() {
  console.log('BitcoinSimulator Port 8080.');
});


let clients = {};

require('./api/api.js')(app, express, io, clients);

const express = require("express");
const app = express();
const port = 8888;

const https = require("https");
var fs = require('fs');
var options = {
  key: fs.readFileSync('./ssl/privkey.pem'),
  cert: fs.readFileSync('./ssl/cert.pem')
};
const server = https.createServer(options, app);
const io = require("socket.io")(server);

// mount public to web
app.use(express.static(__dirname + "/public"));

// enable command line input
const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
})

let broadcaster = {}
let watcher = {}

io.sockets.on("connection", socket => {
  /*readline.on('line', user_text => {
    socket.emit("test", user_text)
  })*/
  var address = socket.handshake.address;
  console.log(`New client page from ${address}, id=${socket.id}`);

  socket.on("log", (data) => {
    console.log("log:", data);
  })

  socket.on("broadcaster", () => {
    if (!(socket.id in broadcaster)) {
      broadcaster[socket.id] = socket.id;
      socket.broadcast.emit("broadcaster");
      console.log(`Get broadcaster request: ${socket.id}`);
    }
    else
      console.log("Duplicated broadcaster");
  })
  socket.on("watcher", () => {
    watcher[socket.id] = socket.id;
    for (const [key, value] of Object.entries(broadcaster)) {
      socket.to(value).emit("watcher", socket.id);
    }
    console.log(`Get watcher request: ${socket.id}`);
  })
  socket.on("offer", (id, message) => {
    socket.to(id).emit("offer", socket.id, message);
  });

  // Message transfer
  socket.on("answer", (id, message) => {
    socket.to(id).emit("answer", socket.id, message);
  });
  socket.on("candidate", (id, message, target) => {
    socket.to(id).emit("candidate", socket.id, message, target);
  });

  // terminated
  socket.on("terminate", () => {
    if (socket.id in broadcaster) {
      delete broadcaster[socket.id];
      socket.broadcast.emit("disconnected", socket.id, "watcher");
    }
  })

  /*socket.on("candidate", (data) => {
    console.log("candidate")
    console.log(data)
    socket.broadcast.emit("candidate", data);
  })
  socket.on("sdp", (data) => {
    console.log("sdp\n")
    console.log(data)
    socket.broadcast.emit("sdp", data);
  })*/
})

server.listen(port, () => console.log(`Server is running on port ${port}`));
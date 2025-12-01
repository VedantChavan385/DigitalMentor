const express = require('express');
const app = express();
const path = require('path');
const mongoose = require('mongoose');
const http = require('http');
const session = require('express-session');
const flash = require('connect-flash');
require('dotenv').config();
const bcrypt = require("bcryptjs");

//Database Connection
const PORT = process.env.PORT || 3000;
const MONGO = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/digitalmentor_db';

mongoose.connect(MONGO).then(()=>console.log('MongoDB connected')).catch(err=>console.error(err));

//Middleware
app.set('view engine','ejs');
app.set('views', path.join(__dirname,'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname,'public')));
app.use(session({ secret: process.env.SESSION_SECRET || 'secret', resave:false, saveUninitialized:false }));
app.use(flash());

//avoid template render errors
app.use((req, res, next) => {
  if (typeof res.locals !== 'object') res.locals = {};
  res.locals.user = res.locals.user || (req.session ? req.session.user : null) || null;
  if (typeof res.locals.unreadCount === 'undefined') res.locals.unreadCount = 0;
  if (typeof res.locals.rtcIceServers === 'undefined') res.locals.rtcIceServers = [];
  next();
});
//flash messages & user middleware
app.use((req,res,next)=>{
  res.locals.success_msg = req.flash('success_msg');
  res.locals.error_msg = req.flash('error_msg');
  res.locals.user = req.session.user || null;
  const ice = [{ urls: 'stun:stun.l.google.com:19302' }];
  if (process.env.TURN_URL && process.env.TURN_USER && process.env.TURN_PASS) {
    ice.push({ urls: process.env.TURN_URL, username: process.env.TURN_USER, credential: process.env.TURN_PASS });
  }
  res.locals.rtcIceServers = ice;
  next();
});

//Route Module
const authRoutes = require('./routes/authRoutes');
const mentorRoutes = require('./routes/mentorRoutes');
const resourceRoutes = require('./routes/resourceRoutes');
const messageRoutes = require('./routes/messageRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const sessionRoutes = require('./routes/sessionRoutes');

//Mongoose
const User = require('./models/User');
const Resource = require('./models/Resource');
const Message = require('./models/Message');
const SessionRequest = require('./models/SessionRequest');

//Socket.IO  connection
const server = http.createServer(app);
const io = require('socket.io')(server);

// socket.io chat
const MessageModel = require('./models/Message');
io.on('connection', socket => {
  //for notifications
  socket.on('register', (userId) => {
    try { socket.join(`user:${userId}`); } catch (e) { console.error('Register socket error', e); }
  });
  socket.on('joinRoom', ({ room }) => {
    socket.join(room);
  });
  socket.on('chatMessage', async (data) => {
    try{
      const msg = await MessageModel.create({ from: data.from, to: data.to, content: data.content, read: false });
      // include sender/receiver names for client display
      let fromName = '';
      let toName = '';
      try { const fu = await User.findById(data.from).select('name'); fromName = fu ? fu.name : ''; } catch(_){}
      try { const tu = await User.findById(data.to).select('name'); toName = tu ? tu.name : ''; } catch(_){}
      io.to(data.room).emit('newMessage', { _id: msg._id, from: data.from, fromName, to: data.to, toName, content: data.content, createdAt: msg.createdAt });

      try{
        const unread = await MessageModel.countDocuments({ to: data.to, read: false });
        io.to(`user:${data.to}`).emit('unread', { count: unread });
      }catch(e){ console.error('Unread emit error', e); }
    }catch(e){ console.error('Socket error', e); }
  });
  // WebRTC
  socket.on('webrtc-offer', (payload) => {
    try {
      try { console.log('RELAY webrtc-offer from', payload.from, 'fromName=', payload.fromName, 'room=', payload.room, 'sdpLen=', payload.offer && payload.offer.sdp && payload.offer.sdp.length); } catch(_){}
      io.to(payload.room).emit('webrtc-offer', payload);
    } catch (e) { console.error(e); }
  });
  socket.on('webrtc-answer', (payload) => {
    try {
      try { console.log('RELAY webrtc-answer from', payload.from, 'fromName=', payload.fromName, 'room=', payload.room, 'sdpLen=', payload.answer && payload.answer.sdp && payload.answer.sdp.length); } catch(_){}
      io.to(payload.room).emit('webrtc-answer', payload);
    } catch (e) { console.error(e); }
  });
  socket.on('webrtc-ice', (payload) => {
    try {
      try { console.log('RELAY webrtc-ice from', payload.from, 'to', payload.to, 'room=', payload.room); } catch(_){}
      io.to(payload.room).emit('webrtc-ice', payload);
    } catch (e) { console.error(e); }
  });
  socket.on('webrtc-end', (payload) => {
    try { io.to(payload.room).emit('webrtc-end', payload); } catch (e) { console.error(e); }
  });
});

//count middleware
app.use(async (req, res, next) => {
  try {
    if (req.session && req.session.user) {
      const cnt = await Message.countDocuments({ to: req.session.user._id, read: false });
      res.locals.unreadCount = cnt;
    } else {
      res.locals.unreadCount = 0;
    }
  } catch (e) {
    res.locals.unreadCount = 0;
  }
  next();
});

// routes
app.use('/', authRoutes);
app.use('/mentors', mentorRoutes);
app.use('/resources', resourceRoutes);
app.use('/messages', messageRoutes);
app.use('/upload', uploadRoutes);
app.use('/sessions', sessionRoutes);


server.listen(PORT, ()=>console.log('Server is running on port 3000'));

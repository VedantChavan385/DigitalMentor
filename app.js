const express = require('express');
const app = express();
const path = require('path');
const mongoose = require('mongoose');
const http = require('http');
const session = require('express-session');
const flash = require('connect-flash');
require('dotenv').config();

//Database Connection
const PORT = process.env.PORT || 3000;
const MONGO = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/digitalmentor_complete';

mongoose.connect(MONGO).then(()=>console.log('MongoDB connected')).catch(err=>console.error(err));


//Middleware
app.set('view engine','ejs');
app.set('views', path.join(__dirname,'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname,'public')));
app.use(session({ secret: process.env.SESSION_SECRET || 'secret', resave:false, saveUninitialized:false }));
app.use(flash());
app.use((req,res,next)=>{
  res.locals.success_msg = req.flash('success_msg');
  res.locals.error_msg = req.flash('error_msg');
  res.locals.user = req.session.user || null;
  next();
});//flash message


//Route Module
const authRoutes = require('./routes/authRoutes');
const mentorRoutes = require('./routes/mentorRoutes');
const resourceRoutes = require('./routes/resourceRoutes');
const messageRoutes = require('./routes/messageRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const sessionRoutes = require('./routes/sessionRoutes');

// routes
app.use('/', authRoutes);
app.use('/mentors', mentorRoutes);
app.use('/resources', resourceRoutes);
app.use('/messages', messageRoutes);
app.use('/upload', uploadRoutes);
app.use('/sessions', sessionRoutes);


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
  socket.on('joinRoom', ({ room }) => {
    socket.join(room);
  });
  socket.on('chatMessage', async (data) => {
    try{
      const msg = await MessageModel.create({ from: data.from, to: data.to, content: data.content });
      io.to(data.room).emit('newMessage', { _id: msg._id, from: data.from, to: data.to, content: data.content, createdAt: msg.createdAt });
    }catch(e){ console.error('Socket error', e); }
  });
});


//Demo data
async function seed(){
  try{
    const count = await User.countDocuments();
    if(count===0){
      const users = [
        { name:'Vanya Patel', email:'vanya@example.com', password:'password123', role:'mentor', expertise:'Full-Stack', bio:'Senior engineer & mentor.' },
        { name:'Ananya Singh', email:'ananya@example.com', password:'password123', role:'mentor', expertise:'HR & Career', bio:'HR specialist.' },
        { name:'Priya Shah', email:'priya@example.com', password:'password123', role:'mentor', expertise:'Product', bio:'Product leader.' },
        { name:'Meera Rao', email:'meera@example.com', password:'password123', role:'mentor', expertise:'Design', bio:'Design mentor.' },
        { name:'Asha Mentee', email:'asha@example.com', password:'password123', role:'mentee', bio:'Returning to work.' },
        { name:'Sana Mentee', email:'sana@example.com', password:'password123', role:'mentee', bio:'Career switcher.' },
        { name:'Admin User', email:'admin@example.com', password:'password123', role:'admin', bio:'Site admin.' }
      ];
      const created = await User.create(users);
      await Resource.create([
        { title:'Restarting your career after a break', category:'Career', content:'<p>A practical guide to relaunch your career.</p>', author: created[0]._id },
        { title:'Resume checklist', category:'Resume', content:'<p>How to present gaps positively.</p>', author: created[1]._id },
        { title:'Top interview tips', category:'Interview', content:'<p>Tips for interviews and communication.</p>', author: created[2]._id }
      ]);
      await Message.create([
        { from: created[4]._id, to: created[0]._id, content: 'Hi Vanya, can you review my resume?' },
        { from: created[5]._id, to: created[1]._id, content: 'Hi Ananya, can I schedule a mock interview?' }
      ]);
      await SessionRequest.create({ mentee: created[4]._id, mentor: created[0]._id, date: new Date(Date.now()+5*24*3600*1000), note:'Resume review' });
      console.log('Seeded demo data');
    } else {
      console.log('DB not empty');
    }
  }catch(err){ console.error('Seed error', err); }
}
seed();


server.listen(PORT, ()=>console.log('Server is running on port 3000'));

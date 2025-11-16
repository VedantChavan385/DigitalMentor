const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
function isAuth(req,res,next){ if(req.session.user) return next(); req.flash('error_msg','Please login'); res.redirect('/login'); }
router.get('/chat/:withId', isAuth, async (req,res)=>{
  const withId = req.params.withId;
  // server-side ACL: only allow mentor <-> mentee chats (admins may chat with anyone)
  try {
    const User = require('../models/User');
    const otherUser = await User.findById(withId).select('role name');
    if (!otherUser) {
      req.flash('error_msg','User not found');
      return res.redirect('/messages');
    }
    const myRole = req.session.user.role;
    if (myRole !== 'admin') {
      const allowed = (myRole === 'mentor' && otherUser.role === 'mentee') || (myRole === 'mentee' && otherUser.role === 'mentor');
      if (!allowed) {
        req.flash('error_msg','Chat allowed only between mentors and mentees');
        return res.redirect('/messages');
      }
    }
  } catch (e) {
    console.error('ACL check error', e);
  }
  // mark incoming messages to this user as read
  try{
    await Message.updateMany({ from: withId, to: req.session.user._id, read: false }, { read: true });
  }catch(e){ console.error('Mark read error', e); }
  const msgs = await Message.find({ $or: [{ from: req.session.user._id, to: withId }, { from: withId, to: req.session.user._id }] }).sort('createdAt').populate('from to','name');
  res.render('chat',{ msgs, withId });
});

// list conversations / available users to chat with
router.get('/', isAuth, async (req, res) => {
  const userId = req.session.user._id;
  // fetch recent messages involving the user
  const msgs = await Message.find({ $or: [{ from: userId }, { to: userId }] }).sort('-createdAt').populate('from to','name avatar');
  const convMap = new Map();
  for (const m of msgs) {
    const other = m.from._id.equals(userId) ? m.to : m.from;
    if (!convMap.has(String(other._id))) {
      convMap.set(String(other._id), { user: other, lastMessage: m.content, lastAt: m.createdAt });
    }
  }
  const conversations = Array.from(convMap.values());

  // For mentors: list mentees so a mentor can call any mentee.
  // For mentees: list mentors. Admins see all other users.
  const User = require('../models/User');
  let others = [];
  if (req.session.user.role === 'mentor') {
    others = await User.find({ role: 'mentee' }).select('name avatar');
  } else if (req.session.user.role === 'mentee') {
    others = await User.find({ role: 'mentor' }).select('name avatar');
  } else {
    // admin or other roles: show everyone except self
    others = await User.find({ _id: { $ne: userId } }).select('name avatar');
  }

  res.render('chatList', { conversations, others });
});
module.exports = router;

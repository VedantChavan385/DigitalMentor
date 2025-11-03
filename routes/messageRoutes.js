const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
function isAuth(req,res,next){ if(req.session.user) return next(); req.flash('error_msg','Please login'); res.redirect('/login'); }
router.get('/chat/:withId', isAuth, async (req,res)=>{
  const withId = req.params.withId;
  const msgs = await Message.find({ $or: [{ from: req.session.user._id, to: withId }, { from: withId, to: req.session.user._id }] }).sort('createdAt').populate('from to','name');
  res.render('chat',{ msgs, withId });
});
module.exports = router;

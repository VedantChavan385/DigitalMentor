const express = require('express');
const multer = require('multer');
const path = require('path');
const User = require('../models/User');
const router = express.Router();
const storage = multer.diskStorage({ destination: (req,file,cb)=>cb(null,'public/uploads/profilePics'), filename: (req,file,cb)=>cb(null,Date.now()+path.extname(file.originalname)) });
const upload = multer({ storage });
router.post('/avatar', upload.single('avatar'), async (req,res)=>{ if(!req.session.user) return res.redirect('/login'); const user = await User.findById(req.session.user._id); user.avatar = '/uploads/profilePics/'+req.file.filename; await user.save(); req.session.user = user; req.flash('success_msg','Avatar uploaded'); res.redirect('/dashboard'); });
module.exports = router;

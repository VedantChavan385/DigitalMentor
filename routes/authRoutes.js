const express = require('express');
const router = express.Router();
const User = require('../models/User');

router.get('/', (req,res)=> res.render('home'));
router.get('/register', (req,res)=> res.render('register'));
router.post('/register', async (req,res)=>{
  try{
    const { name,email,password,role,expertise,bio } = req.body;
    if(await User.findOne({ email })){ req.flash('error_msg','Email exists'); return res.redirect('/register'); }
    const u = new User({ name,email,password,role,expertise,bio }); await u.save(); req.flash('success_msg','Registered. Login.'); res.redirect('/login');
  }catch(e){ console.error(e); req.flash('error_msg','Error'); res.redirect('/register'); }
});
router.get('/login',(req,res)=>res.render('login'));
router.post('/login', async (req,res)=>{
  try{
    const { email,password } = req.body; const user = await User.findOne({ email }); if(!user){ req.flash('error_msg','Invalid credentials'); return res.redirect('/login'); }
    const ok = await user.matchPassword(password); if(!ok){ req.flash('error_msg','Invalid credentials'); return res.redirect('/login'); }
    req.session.user = user; req.flash('success_msg','Welcome'); res.redirect('/dashboard');
  }catch(e){ console.error(e); req.flash('error_msg','Error'); res.redirect('/login'); }
});
router.get('/dashboard', async (req,res)=>{ if(!req.session.user) return res.redirect('/login'); const user = await User.findById(req.session.user._id); res.render('dashboard',{ user }); });
router.get('/logout',(req,res)=>{ req.session.destroy(()=>{ res.clearCookie('connect.sid'); res.redirect('/'); }); });
router.get('/about', (req,res)=> res.render('aboutUs'));
module.exports = router;

const express = require('express');
const router = express.Router();
const User = require('../models/User');
router.get('/', async (req,res)=>{ const mentors = await User.find({ role:'mentor' }); res.render('mentors',{ mentors }); });
router.get('/profile/:id', async (req,res)=>{ const mentor = await User.findById(req.params.id); if(!mentor){ req.flash('error_msg','Not found'); return res.redirect('/mentors'); } res.render('mentorProfile',{ mentor }); });
module.exports = router;

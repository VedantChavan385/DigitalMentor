const express = require('express');
const router = express.Router();
const Resource = require('../models/Resource');
function isAuth(req,res,next){ if(req.session.user) return next(); req.flash('error_msg','Please login'); res.redirect('/login'); }
router.get('/', async (req,res)=>{
  const q = req.query.q || '';
  const category = req.query.category || '';
  const page = parseInt(req.query.page) || 1;
  const perPage = 5;
  const filter = {};
  if(q) filter.title = new RegExp(q, 'i');
  if(category) filter.category = category;
  const total = await Resource.countDocuments(filter);
  const list = await Resource.find(filter).sort('-createdAt').skip((page-1)*perPage).limit(perPage).populate('author','name');
  const categories = ['Career','Technology','Soft Skills','Interview','Resume','Work-Life Balance'];
  res.render('resources',{ list, q, category, page, pages: Math.ceil(total/perPage), categories });
});
router.get('/add', isAuth, (req,res)=>{ if(req.session.user.role!=='mentor' && req.session.user.role!=='admin'){ req.flash('error_msg','Only mentors/admin can add resources'); return res.redirect('/resources'); } const categories = ['Career','Technology','Soft Skills','Interview','Resume','Work-Life Balance']; res.render('addResource',{ categories }); });
router.post('/add', isAuth, async (req,res)=>{
  try{
    if(req.session.user.role!=='mentor' && req.session.user.role!=='admin'){ req.flash('error_msg','Only mentors/admin can add resources'); return res.redirect('/resources'); }
    const { title, category, content } = req.body;
    await Resource.create({ title, category, content, author: req.session.user._id });
    req.flash('success_msg','Resource added'); res.redirect('/resources');
  }catch(err){ console.error(err); req.flash('error_msg','Failed to add resource'); res.redirect('/resources'); }
});
router.get('/:id', async (req,res)=>{ const r = await Resource.findById(req.params.id).populate('author','name'); if(!r){ req.flash('error_msg','Not found'); return res.redirect('/resources'); } res.render('resourceView',{ r }); });
module.exports = router;

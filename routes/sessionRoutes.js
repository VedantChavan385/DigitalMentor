const express = require('express');
const router = express.Router();
const SessionRequest = require('../models/SessionRequest');
function isAuth(req,res,next){ if(req.session.user) return next(); req.flash('error_msg','Please login'); res.redirect('/login'); }
router.post('/request/:mentorId', isAuth, async (req,res)=>{
	try {
		const { date, note } = req.body;
		// basic validation
			if (!date) {
				req.flash('error_msg', 'Please select a date for the session');
				return res.redirect(req.get('Referrer') || '/mentors');
			}
		const parsed = new Date(date);
			if (isNaN(parsed.getTime())) {
				req.flash('error_msg', 'Invalid date provided');
				return res.redirect(req.get('Referrer') || '/mentors');
			}
		await SessionRequest.create({ mentee: req.session.user._id, mentor: req.params.mentorId, date: parsed, note });
		req.flash('success_msg','Session requested');
		res.redirect('/dashboard');
	} catch (err) {
		console.error('SessionRequest create error', err);
		// expose validation error message if available
		const msg = err && err.message ? err.message : 'Session request failed';
		req.flash('error_msg', msg);
		res.redirect(req.get('Referrer') || '/mentors');
	}
});
router.get('/requests', isAuth, async (req,res)=>{ if(req.session.user.role!=='mentor'){ req.flash('error_msg','Access denied'); return res.redirect('/dashboard'); } const requests = await SessionRequest.find({ mentor: req.session.user._id }).populate('mentee'); res.render('sessionRequests',{ requests }); });
router.post('/requests/:id/:action', isAuth, async (req,res)=>{ const action = req.params.action; const status = action==='accept' ? 'accepted' : 'rejected'; await SessionRequest.findByIdAndUpdate(req.params.id,{ status }); req.flash('success_msg','Updated'); res.redirect('/sessions/requests'); });
module.exports = router;

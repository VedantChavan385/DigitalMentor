const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const schema = new mongoose.Schema({ name:String, email:{type:String, unique:true}, password:String, role:{type:String, enum:['mentor','mentee','admin'], default:'mentee'}, expertise:String, bio:String, avatar:String });
schema.pre('save', async function(next){ if(!this.isModified('password')) return next(); this.password = await bcrypt.hash(this.password,10); next(); });
schema.methods.matchPassword = function(p){ return require('bcrypt').compare(p, this.password); };
module.exports = mongoose.model('User', schema);

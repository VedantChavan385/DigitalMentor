const mongoose = require('mongoose');
const schema = new mongoose.Schema({ mentee:{type:mongoose.Schema.Types.ObjectId, ref:'User'}, mentor:{type:mongoose.Schema.Types.ObjectId, ref:'User'}, date:Date, note:String, status:{type:String, enum:['pending','accepted','rejected'], default:'pending'}, createdAt:{type:Date, default:Date.now} });
module.exports = mongoose.model('SessionRequest', schema);

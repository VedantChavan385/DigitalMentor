const mongoose = require('mongoose');
const schema = new mongoose.Schema({ title:String, category:String, content:String, author:{type:mongoose.Schema.Types.ObjectId, ref:'User'}, createdAt:{type:Date, default:Date.now} });
module.exports = mongoose.model('Resource', schema);

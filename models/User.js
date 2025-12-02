const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');  // use bcryptjs everywhere

const schema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  role: { type: String, enum: ['mentor', 'mentee', 'admin'], default: 'mentee' },
  expertise: String,
  bio: String,
  avatar: String
});

// Hash password before saving
schema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Compare entered password with stored hash
schema.methods.matchPassword = function (p) {
  return bcrypt.compare(p, this.password);  // FIXED
};

module.exports = mongoose.model('User', schema);

var mongoose = require('mongoose');

var UserSchema = new mongoose.Schema({
    netid: String,
    office_hours: { type: Array, default: []},
    committees: { type: Array, default: []}},
    { usePushEach: true});

module.exports = mongoose.model('User', UserSchema);

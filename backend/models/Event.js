const mongoose = require('mongoose');

const EventSchema = new mongoose.Schema({
  title: { type: String, required: true },
  start: { type: Date, required: true },
  end: { type: Date, required: true },
  type: { 
    type: String, 
    enum: ['Class', 'Study', 'Project', 'Fitness', 'Recovery', 'Social', 'Admin', 'Other'], 
    default: 'Study' 
  },
  
  // --- ADVANCED METRICS ---
  subject: { type: String, default: '' }, 
  priority: { type: Number, min: 1, max: 5, default: 3 }, 
  cognitiveLoad: { type: Number, min: 1, max: 10, default: 5 }, 
  
  // --- POST-EVENT TRACKING ---
  status: { type: String, enum: ['Pending', 'Completed', 'Missed'], default: 'Pending' },
  focusScore: { type: Number, min: 1, max: 10, default: null } // THIS WAS MISSING!
}, { timestamps: true });

module.exports = mongoose.model('Event', EventSchema);
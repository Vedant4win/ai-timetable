import PriorityChart from './PriorityChart';
import { useState, useEffect } from 'react';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import axios from 'axios';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, LineChart, Line } from 'recharts';
import 'react-big-calendar/lib/css/react-big-calendar.css';

const localizer = momentLocalizer(moment);

const COLORS = { Class: '#ef4444', Study: '#3b82f6', Project: '#f59e0b', Fitness: '#10b981', Recovery: '#8b5cf6', Social: '#ec4899', Admin: '#475569', Other: '#64748b' };

function App() {
  // Auto-Plan State
  const [isAutoPlanModalOpen, setIsAutoPlanModalOpen] = useState(false);
  const [nlpPrompt, setNlpPrompt] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [events, setEvents] = useState([]);
  const [activeView, setActiveView] = useState('calendar'); 
  // --- CALENDAR NAVIGATION STATE ---
  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentView, setCurrentView] = useState('week');
  const [aiMetrics, setAiMetrics] = useState([]); 
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [draftEvent, setDraftEvent] = useState({ title: '', start: null, end: null, type: 'Study', subject: '', priority: 3, cognitiveLoad: 5 });
  
  // NEW: State for the live AI Prediction
  const [livePrediction, setLivePrediction] = useState(null);

  const [isResolveModalOpen, setIsResolveModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [focusScore, setFocusScore] = useState(5);

  useEffect(() => { fetchEvents(); fetchAiMetrics(); }, []);

  // NEW: Watch the sliders and time slot, and ask Python for a prediction
  useEffect(() => {
    if (isModalOpen && draftEvent.start && draftEvent.cognitiveLoad) {
      const hourOfDay = new Date(draftEvent.start).getHours();
      axios.post('https://ai-timetable-python.onrender.com/api/predict/focus', {
        cognitive_load: draftEvent.cognitiveLoad,
        hour_of_day: hourOfDay
      }).then(res => setLivePrediction(res.data))
        .catch(err => console.error("AI Prediction Error:", err));
    }
  }, [draftEvent.cognitiveLoad, draftEvent.start, isModalOpen]);

  const fetchEvents = async () => {
    try {
      const res = await axios.get('https://ai-timetable-backend-lkq8.onrender.com/api/events');
      setEvents(res.data.map(e => ({ ...e, start: new Date(e.start), end: new Date(e.end) })));
    } catch (err) {}
  };

  const fetchAiMetrics = async () => {
    try {
      const res = await axios.get('https://ai-timetable-python.onrender.com/api/analysis/focus-metrics');
      if (!res.data.error) setAiMetrics(res.data);
    } catch (err) {}
  };

  const handleSelectSlot = ({ start, end }) => {
    setDraftEvent({ title: '', start, end, type: 'Study', subject: '', priority: 3, cognitiveLoad: 5 }); 
    setLivePrediction(null); // Reset prediction
    setIsModalOpen(true);
  };

  const handleSaveEvent = async () => {
    if (!draftEvent.title.trim()) return alert("Title required.");
    try {
      const res = await axios.post('https://ai-timetable-backend-lkq8.onrender.com/api/events', draftEvent);
      setEvents([...events, { ...res.data, start: new Date(res.data.start), end: new Date(res.data.end) }]);
      setIsModalOpen(false);
      fetchAiMetrics();
    } catch (err) {}
  };

  const handleClearSchedule = async () => {
  if (window.confirm("Are you sure you want to clear the entire schedule?")) {
    try {
      const response = await fetch('https://ai-timetable-backend-lkq8.onrender.com/api/schedule/clear', {
        method: 'DELETE',
      });
      if (response.ok) {
        setEvents([]); 
      }
    } catch (error) {
      console.error("Failed to clear schedule:", error);
    }
  }
};

 const handleAutoSchedule = async () => {
    if (!nlpPrompt.trim()) return alert("Tell the engine what you want to schedule.");
    setIsProcessing(true);
    
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const startDateString = tomorrow.toISOString().split('T')[0];

    try {
      // Send the plain English to the Python NLP route
      const res = await axios.post('https://ai-timetable-python.onrender.com/api/schedule/nlp', {
        user_prompt: nlpPrompt,
        start_date: startDateString
      });

      if (res.data.status === 'success') {
        const blocks = res.data.scheduled_blocks;
        const savedEvents = [];
        
        for (let block of blocks) {
          const saveRes = await axios.post('https://ai-timetable-backend-lkq8.onrender.com/api/events', block);
          savedEvents.push({ ...saveRes.data, start: new Date(saveRes.data.start), end: new Date(saveRes.data.end) });
        }
        
        setEvents([...events, ...savedEvents]);
        setIsAutoPlanModalOpen(false);
        setNlpPrompt(''); // Clear the prompt
        alert(`Successfully scheduled ${blocks.length} tasks!`);
      } else {
        alert("The AI couldn't parse your request. Try being more specific.");
      }
    } catch (err) {
      console.error("NLP Auto-Schedule Error:", err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSelectEvent = (event) => {
    setSelectedEvent(event);
    setFocusScore(event.focusScore || 5); 
    setIsResolveModalOpen(true);
  };

  const handleResolveEvent = async (status) => {
    try {
      const updatedData = { ...selectedEvent, status, ...(status === 'Completed' ? { focusScore } : {}) };
      const res = await axios.put(`https://ai-timetable-backend-lkq8.onrender.com/api/events/${selectedEvent._id}`, updatedData);
      setEvents(events.map(e => e._id === selectedEvent._id ? { ...res.data, start: new Date(res.data.start), end: new Date(res.data.end) } : e));
      setIsResolveModalOpen(false);
      fetchAiMetrics();
    } catch (err) {}
  };

  const handleDeleteEvent = async () => {
    if (window.confirm(`Permanently delete '${selectedEvent.title}'?`)) {
      try {
        await axios.delete(`https://ai-timetable-backend-lkq8.onrender.com/api/events/${selectedEvent._id}`);
        setEvents(events.filter(e => e._id !== selectedEvent._id));
        setIsResolveModalOpen(false);
      } catch (err) {}
    }
  };

  const eventStyleGetter = (event) => ({
    style: { backgroundColor: COLORS[event.type] || COLORS.Other, borderRadius: '6px', opacity: (event.status === 'Completed' ? 0.6 : 0.9), color: 'white', border: 'none', boxShadow: '0 2px 4px rgba(0,0,0,0.2)', padding: '2px 5px', fontWeight: '600', fontSize: '0.85rem', textDecoration: event.status === 'Missed' ? 'line-through' : 'none' }
  });

  const chartData = (() => {
    const stats = {};
    events.forEach(ev => {
      const hours = (new Date(ev.end) - new Date(ev.start)) / (1000 * 60 * 60);
      if (!stats[ev.type]) stats[ev.type] = { name: ev.type, hours: 0, count: 0, totalLoad: 0 };
      stats[ev.type].hours += hours;
      stats[ev.type].count += 1;
      stats[ev.type].totalLoad += (ev.cognitiveLoad || 5);
    });
    return Object.values(stats).map(s => ({ ...s, hours: Number(s.hours.toFixed(2)), avgLoad: Number((s.totalLoad / s.count).toFixed(1)) })).sort((a, b) => b.hours - a.hours); 
  })();

  return (
    <div style={{ padding: '30px', fontFamily: '"Inter", sans-serif', maxWidth: '1200px', margin: '0 auto' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ margin: 0, color: '#0f172a', fontWeight: '800', letterSpacing: '-0.5px' }}>Strategic Engine v4.0 (Predictive)</h1>
        
        <div style={{ display: 'flex', gap: '10px', backgroundColor: '#f1f5f9', padding: '5px', borderRadius: '8px' }}>
          
          <button onClick={() => setActiveView('calendar')} style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: '600', backgroundColor: activeView === 'calendar' ? '#ffffff' : 'transparent', color: activeView === 'calendar' ? '#0f172a' : '#64748b', boxShadow: activeView === 'calendar' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none' }}>
            Grid View
          </button>
          
          <button onClick={() => setActiveView('analytics')} style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: '600', backgroundColor: activeView === 'analytics' ? '#ffffff' : 'transparent', color: activeView === 'analytics' ? '#0f172a' : '#64748b', boxShadow: activeView === 'analytics' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none' }}>
            Analytics
          </button>
          
          <button 
            onClick={handleClearSchedule} 
            style={{ 
              padding: '8px 16px', 
              borderRadius: '6px', 
              border: '1px solid #fca5a5', 
              cursor: 'pointer', 
              fontWeight: '600', 
              backgroundColor: 'transparent', 
              color: '#ef4444' 
            }}
          >
            🗑️ Clear All
          </button>

          <button 
            onClick={() => setIsAutoPlanModalOpen(true)} 
            style={{ 
              padding: '8px 16px', 
              borderRadius: '6px', 
              border: 'none', 
              cursor: 'pointer', 
              fontWeight: 'bold', 
              backgroundColor: '#38bdf8', 
              color: '#0f172a', 
              boxShadow: '0 4px 6px rgba(56, 189, 248, 0.3)' 
            }}
          >
            ⚡ Auto-Plan 
          </button>

        </div>
      </div> {/* <--- THIS IS THE DIV THAT WAS MISSING! */}
      
      {activeView === 'calendar' && (
        <div style={{ height: '80vh', backgroundColor: '#ffffff', padding: '20px', borderRadius: '16px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', border: '1px solid #e2e8f0' }}>
          <Calendar 
          localizer={localizer} 
          events={events} 
          startAccessor="start" 
          endAccessor="end" 
          views={['month', 'week', 'day']} 
          
          // --- NEW NAVIGATION WIRING ---
          date={currentDate}
          onNavigate={(newDate) => setCurrentDate(newDate)}
          view={currentView}
          onView={(newView) => setCurrentView(newView)}
          // -----------------------------

          selectable={true} 
          onSelectSlot={handleSelectSlot} 
          onSelectEvent={handleSelectEvent} 
          eventPropGetter={eventStyleGetter} 
          style={{ height: '100%' }} 
        />
        </div>
      )}

      {activeView === 'analytics' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          
          <div style={{ backgroundColor: '#ffffff', padding: '20px', borderRadius: '16px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', border: '1px solid #e2e8f0', height: '350px' }}><h3 style={{ marginTop: 0, color: '#334155' }}>Resource Allocation (Hours)</h3><ResponsiveContainer width="100%" height="85%"><PieChart><Pie data={chartData} dataKey="hours" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>{chartData.map((e, i) => <Cell key={i} fill={COLORS[e.name] || COLORS.Other} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div>
          
          <div style={{ backgroundColor: '#ffffff', padding: '20px', borderRadius: '16px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', border: '1px solid #e2e8f0', height: '350px' }}><h3 style={{ marginTop: 0, color: '#334155' }}>Avg Cognitive Load per Category</h3><ResponsiveContainer width="100%" height="85%"><BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" /><XAxis dataKey="name" stroke="#64748b" /><YAxis domain={[0, 10]} stroke="#64748b" /><Tooltip cursor={{fill: '#f8fafc'}} /><Bar dataKey="avgLoad" radius={[4, 4, 0, 0]}>{chartData.map((e, i) => <Cell key={i} fill={COLORS[e.name] || COLORS.Other} />)}</Bar></BarChart></ResponsiveContainer></div>
          
          <div style={{ gridColumn: '1 / -1', backgroundColor: '#0f172a', padding: '25px', borderRadius: '16px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.2)', border: '1px solid #1e293b', height: '300px' }}><h3 style={{ marginTop: 0, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '10px' }}><span style={{ color: '#38bdf8' }}>⚡</span> AI Strategic Insights</h3>{aiMetrics.length > 0 ? (<ResponsiveContainer width="100%" height="80%"><LineChart data={aiMetrics}><CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} /><XAxis dataKey="cognitiveLoad" stroke="#94a3b8" /><YAxis domain={[0, 10]} stroke="#94a3b8" /><Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#f8fafc' }} /><Line type="monotone" dataKey="focusScore" stroke="#38bdf8" strokeWidth={3} dot={{ r: 6, fill: '#0f172a', stroke: '#38bdf8', strokeWidth: 2 }} activeDot={{ r: 8 }} /></LineChart></ResponsiveContainer>) : (<div style={{ color: '#64748b', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontStyle: 'italic' }}>Awaiting data...</div>)}</div>
          
          {/* --- NEW PRIORITY CHART DROPPED HERE --- */}
          <div style={{ gridColumn: '1 / -1' }}>
            <PriorityChart />
          </div>

        </div>
      )}

      {isModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(5px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '12px', width: '450px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
            <h2 style={{ marginTop: 0, marginBottom: '20px', color: '#0f172a', borderBottom: '2px solid #f1f5f9', paddingBottom: '10px' }}>Configure Block</h2>
            
            <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
              <input type="text" placeholder="Title (e.g., ISI Prep)" value={draftEvent.title} onChange={(e) => setDraftEvent({...draftEvent, title: e.target.value})} style={{ flex: 2, padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
              <select value={draftEvent.type} onChange={(e) => setDraftEvent({...draftEvent, type: e.target.value})} style={{ flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                <optgroup label="Academic & Work"><option value="Class">Class</option><option value="Study">Study</option><option value="Project">Project</option></optgroup>
                <optgroup label="Life & Maintenance"><option value="Fitness">Fitness</option><option value="Recovery">Recovery</option><option value="Social">Social</option><option value="Admin">Admin</option><option value="Other">Other</option></optgroup>
              </select>
            </div>
            
            <input type="text" placeholder="Subject / Tag" value={draftEvent.subject} onChange={(e) => setDraftEvent({...draftEvent, subject: e.target.value})} style={{ width: '100%', padding: '10px', marginBottom: '15px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
            <div style={{ marginBottom: '15px' }}><label style={{ display: 'block', fontSize: '0.85rem', color: '#64748b', fontWeight: 'bold', marginBottom: '5px' }}>Cognitive Load (1-10): {draftEvent.cognitiveLoad}</label><input type="range" min="1" max="10" value={draftEvent.cognitiveLoad} onChange={(e) => setDraftEvent({...draftEvent, cognitiveLoad: Number(e.target.value)})} style={{ width: '100%' }} /></div>
            <div style={{ marginBottom: '15px' }}><label style={{ display: 'block', fontSize: '0.85rem', color: '#64748b', fontWeight: 'bold', marginBottom: '5px' }}>Priority Level (1-5): {draftEvent.priority}</label><input type="range" min="1" max="5" value={draftEvent.priority} onChange={(e) => setDraftEvent({...draftEvent, priority: Number(e.target.value)})} style={{ width: '100%' }} /></div>

            {/* NEW: THE AI PREDICTION BANNER */}
            {livePrediction && (
              <div style={{ marginBottom: '20px', padding: '12px', borderRadius: '8px', backgroundColor: livePrediction.warning ? '#fef2f2' : '#f0fdf4', border: `1px solid ${livePrediction.warning ? '#fca5a5' : '#86efac'}` }}>
                <h4 style={{ margin: 0, color: livePrediction.warning ? '#ef4444' : '#10b981', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem' }}>
                  {livePrediction.warning ? '⚠️ Strategic Warning' : '✅ Optimal Placement'}
                </h4>
                <p style={{ margin: '5px 0 0 0', fontSize: '0.8rem', color: '#475569', fontWeight: '500' }}>
                  {livePrediction.predicted_focus === 'Needs more data' 
                    ? 'AI requires more resolved tasks to make a calculation.' 
                    : `Predicted Focus Output: ${livePrediction.predicted_focus} / 10`}
                </p>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setIsModalOpen(false)} style={{ padding: '10px 20px', borderRadius: '6px', border: 'none', backgroundColor: '#e2e8f0', color: '#475569', cursor: 'pointer', fontWeight: '600' }}>Cancel</button>
              <button onClick={handleSaveEvent} style={{ padding: '10px 20px', borderRadius: '6px', border: 'none', backgroundColor: '#2563eb', color: 'white', cursor: 'pointer', fontWeight: '600' }}>Save Parameters</button>
            </div>
          </div>
        </div>
      )}

      {/* RESOLVE MODAL (Unchanged) */}
      {isResolveModalOpen && selectedEvent && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(5px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '12px', width: '400px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '2px solid #f1f5f9', paddingBottom: '10px' }}>
              <h2 style={{ margin: 0, color: '#0f172a' }}>Resolve: {selectedEvent.title}</h2>
              <span style={{ backgroundColor: selectedEvent.status === 'Completed' ? '#10b981' : selectedEvent.status === 'Missed' ? '#ef4444' : '#f1f5f9', color: selectedEvent.status === 'Pending' ? '#64748b' : 'white', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold' }}>{selectedEvent.status || 'Pending'}</span>
            </div>
            <div style={{ marginBottom: '25px' }}><label style={{ display: 'block', fontSize: '0.9rem', color: '#475569', fontWeight: 'bold', marginBottom: '10px' }}>Actual Focus (1-10): <span style={{ color: '#2563eb', fontSize: '1.1rem' }}>{focusScore}</span></label><input type="range" min="1" max="10" value={focusScore} onChange={(e) => setFocusScore(Number(e.target.value))} style={{ width: '100%' }} /></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button onClick={() => handleResolveEvent('Completed')} style={{ padding: '12px', borderRadius: '6px', border: 'none', backgroundColor: '#10b981', color: 'white', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem' }}>Mark Completed</button>
              <div style={{ display: 'flex', gap: '10px' }}><button onClick={() => handleResolveEvent('Missed')} style={{ flex: 1, padding: '10px', borderRadius: '6px', border: 'none', backgroundColor: '#f1f5f9', color: '#ef4444', cursor: 'pointer', fontWeight: '600' }}>Mark Missed</button><button onClick={handleDeleteEvent} style={{ flex: 1, padding: '10px', borderRadius: '6px', border: 'none', backgroundColor: '#f1f5f9', color: '#64748b', cursor: 'pointer', fontWeight: '600' }}>Delete</button></div>
              <button onClick={() => setIsResolveModalOpen(false)} style={{ marginTop: '10px', padding: '8px', borderRadius: '6px', border: 'none', backgroundColor: 'transparent', color: '#94a3b8', cursor: 'pointer', textDecoration: 'underline' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
{/* AUTO-PLAN MODAL */}
      {isAutoPlanModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.8)', backdropFilter: 'blur(5px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: '#1e293b', padding: '30px', borderRadius: '12px', width: '500px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', color: 'white' }}>
            <h2 style={{ marginTop: 0, marginBottom: '20px', color: '#f8fafc', borderBottom: '1px solid #334155', paddingBottom: '10px' }}>
              <span style={{ color: '#38bdf8' }}>⚡</span> Strategic AI Console
            </h2>
            <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '20px' }}>
              Type your goals in plain English. The AI will extract the parameters, run them through your historical focus model, and mathematically place them on your grid.
            </p>
            
            <textarea 
              placeholder="e.g., I need to study GATE Mathematics for 3 hours, do a 1.5 hour C++ project, and hit the gym for 1 hour."
              value={nlpPrompt}
              onChange={(e) => setNlpPrompt(e.target.value)}
              style={{ width: '100%', height: '120px', padding: '15px', borderRadius: '8px', border: '1px solid #475569', backgroundColor: '#0f172a', color: 'white', boxSizing: 'border-box', fontFamily: 'inherit', resize: 'none', marginBottom: '20px' }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setIsAutoPlanModalOpen(false)} disabled={isProcessing} style={{ padding: '10px 20px', borderRadius: '6px', border: 'none', backgroundColor: '#334155', color: '#f8fafc', cursor: 'pointer', fontWeight: '600' }}>Cancel</button>
              <button onClick={handleAutoSchedule} disabled={isProcessing} style={{ padding: '10px 20px', borderRadius: '6px', border: 'none', backgroundColor: isProcessing ? '#0284c7' : '#38bdf8', color: '#0f172a', cursor: isProcessing ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>
                {isProcessing ? 'Thinking...' : 'Execute Strategy'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
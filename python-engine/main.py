import math
import re  # <--- Add this line here!
from google import genai
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pymongo import MongoClient
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
import os
from dotenv import load_dotenv
from datetime import datetime, timedelta, timezone
import math
from google import genai
from google.genai import types
import json
import requests  

load_dotenv()

# --- INITIALIZATION ---
client_ai = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
app = FastAPI(title="Strategic Engine AI Core v5.2 - Ironclad Time-Lock")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MONGO_URI = os.getenv("MONGO_URI")
client = MongoClient(MONGO_URI)
db = client['test'] 
events_collection = db['events']

# --- DATA MODELS ---
class Goal(BaseModel):
    title: str
    duration_hours: float
    type: str
    subject: str
    cognitive_load: int
    priority: int
    target_hour: int = -1 

class AutoScheduleRequest(BaseModel):
    goals: list[Goal]
    start_date: str 

class NLPRequest(BaseModel):
    user_prompt: str
    start_date: str

class PredictRequest(BaseModel):
    cognitive_load: int
    hour_of_day: int

# --- MACHINE LEARNING CORE ---
def train_predictive_model():
    events = list(events_collection.find({"status": "Completed"}))
    if len(events) < 3: return None
    df = pd.DataFrame(events)
    if 'focusScore' not in df.columns or 'start' not in df.columns: return None
    df = df.dropna(subset=['focusScore', 'cognitiveLoad', 'start'])
    if df.empty: return None
    
    df['hour'] = pd.to_datetime(df['start']).dt.hour
    X = df[['cognitiveLoad', 'hour']].values
    y = df['focusScore']
    model = RandomForestRegressor(n_estimators=50, random_state=42)
    model.fit(X, y)
    return model

# --- ADMIN TOOL: SEED ML TRAINING DATA ---
@app.post("/api/admin/seed-training-data")
def seed_training_data():
    """Injects dummy data to train the Random Forest model."""
    import random
    
    # Optional: Clear old dummy data so we don't duplicate
    events_collection.delete_many({"is_dummy": True})
    
    dummy_data = []
    base_date = datetime.now()
    
    def create_event(days_ago, hour, cog_load, focus_score):
        dt = base_date - timedelta(days=days_ago)
        dt = dt.replace(hour=hour, minute=0, second=0, microsecond=0)
        dummy_data.append({
            "title": f"Historical Task {len(dummy_data)}",
            "type": "Study",
            "start": dt.isoformat(),
            "end": (dt + timedelta(hours=1)).isoformat(),
            "status": "Completed", # MUST be 'Completed' for the ML model to read it
            "cognitiveLoad": cog_load,
            "focusScore": focus_score,
            "is_dummy": True # Tags it so you can easily delete it later
        })

    # Generate 14 days of historical data
    for day in range(1, 15):
        # MORNINGS (Great for high cognitive load)
        create_event(day, 9, cog_load=8, focus_score=random.uniform(8.5, 10.0))
        create_event(day, 10, cog_load=9, focus_score=random.uniform(8.0, 9.5))
        
        # AFTERNOONS (Average focus)
        create_event(day, 14, cog_load=6, focus_score=random.uniform(6.0, 7.5))
        
        # LATE NIGHTS (Terrible focus for heavy tasks - teaches the AI to avoid midnight!)
        create_event(day, 23, cog_load=8, focus_score=random.uniform(2.0, 4.0))
        create_event(day, 0, cog_load=9, focus_score=random.uniform(1.0, 3.0))

    events_collection.insert_many(dummy_data)
    
    # Test if the model trains successfully now
    model = train_predictive_model()
    
    return {
        "status": "success", 
        "message": f"Injected {len(dummy_data)} training records.", 
        "model_is_active": model is not None
    }

# --- THE STABLE SCHEDULER (Ironclad Math & Node.js Shield) ---
@app.post("/api/schedule/auto")
def auto_schedule(req: AutoScheduleRequest):
    model = train_predictive_model()
    IST = timezone(timedelta(hours=5, minutes=30))
    
    search_days = 7 
    work_start_hour = 0
    work_end_hour = 24 
    
    base_date_naive = datetime.strptime(req.start_date, "%Y-%m-%d")
    base_date = base_date_naive.replace(tzinfo=IST)
    
    end_date = base_date + timedelta(days=search_days)
    
    # --- FIX: THE BULLETPROOF SHIELD ---
    # Fetch all events and filter mathematically in Python to bypass string/date mismatch bugs
    all_events = list(events_collection.find())
    busy_hours = set()
    
    for ev in all_events:
        s_val = ev.get('start')
        e_val = ev.get('end')
        if not s_val or not e_val: continue
        
        try:
            # Handle Node.js ISO Strings safely
            if isinstance(s_val, str):
                # Clean the string for Python's parser
                clean_start = s_val.replace('Z', '+00:00')
                clean_end = e_val.replace('Z', '+00:00')
                ev_start = datetime.fromisoformat(clean_start).astimezone(IST)
                ev_end = datetime.fromisoformat(clean_end).astimezone(IST)
            # Handle Native Datetime Objects
            else:
                ev_start = s_val.replace(tzinfo=timezone.utc).astimezone(IST)
                ev_end = e_val.replace(tzinfo=timezone.utc).astimezone(IST)
                
            # Populate the shield if it falls within our search window
            if base_date <= ev_start <= end_date:
                curr = ev_start.replace(minute=0, second=0, microsecond=0)
                while curr < ev_end:
                    busy_hours.add(curr.strftime("%Y-%m-%d-%H"))
                    curr += timedelta(hours=1)
        except Exception as e:
            # Silently skip corrupted database entries
            continue

    generated_schedule = []
    sorted_goals = sorted(req.goals, key=lambda x: x.priority, reverse=True)
    
    # Allowed types for Node.js Mongoose Schema
    allowed_types = ['Class', 'Study', 'Project', 'Fitness', 'Recovery', 'Social', 'Admin', 'Other']
    
    for goal in sorted_goals:
        best_slot, best_score = None, -1
        duration_ceil = math.ceil(max(0.25, goal.duration_hours))
        
        for day_offset in range(search_days):
            current_day = base_date + timedelta(days=day_offset)
            
            # --- THE FIX: Precise Regex Date Extraction ---
            date_bonus = 0.0
            # This looks specifically for a number immediately following a parenthesis e.g., "(26"
            match = re.search(r'\((\d+)', goal.title) 
            if match:
                target_day = int(match.group(1))
                if current_day.day == target_day:
                    date_bonus = 20.0

            # If time-locked, explicitly only check that exact hour
            if getattr(goal, 'target_hour', -1) != -1:
                hours_to_check = [goal.target_hour]
            else:
                hours_to_check = range(work_start_hour, work_end_hour - duration_ceil + 1)

            for hour in hours_to_check:
                if hour < 0 or hour > 23: continue
                
                test_time = current_day.replace(hour=hour)
                
                conflict = False
                for o in range(duration_ceil):
                    if (test_time + timedelta(hours=o)).strftime("%Y-%m-%d-%H") in busy_hours:
                        conflict = True
                        break
                
                if conflict:
                    continue
                
                pred_focus = model.predict([[goal.cognitive_load, hour]])[0] if model else 5.0
                
                # Combine 999 with date_bonus so the time-lock forces the correct DAY and HOUR
                if getattr(goal, 'target_hour', -1) != -1:
                    total_score = 999.0 + date_bonus
                else:
                    total_score = pred_focus + date_bonus
                
                if total_score > best_score:
                    best_score = total_score
                    best_slot = test_time
        
        if best_slot:
            end_t = best_slot + timedelta(hours=goal.duration_hours)
            
            # THE SHIELD: Sanitize all AI inputs so Node.js NEVER 500 errors
            safe_type = goal.type if goal.type in allowed_types else 'Other'
            
            generated_schedule.append({
                "title": str(goal.title or "Task"), 
                "start": best_slot.isoformat(), 
                "end": end_t.isoformat(),
                "type": safe_type, 
                "subject": str(goal.subject or ""), 
                "cognitiveLoad": max(1, min(10, int(goal.cognitive_load))),
                "priority": max(1, min(5, int(goal.priority))), 
                "status": "Pending", 
                "predictedFocus": float(round(min(pred_focus, 10.0), 1)) 
            })
            curr = best_slot
            while curr < end_t:
                busy_hours.add(curr.strftime("%Y-%m-%d-%H"))
                curr += timedelta(hours=1)
                
    return {"status": "success", "scheduled_blocks": generated_schedule}

# --- TACTICAL WIPE ---
@app.delete("/api/schedule/clear")
@app.delete("/api/events")
def clear_schedule():
    # THE FIX: Only delete items where 'is_dummy' is NOT true
    result = events_collection.delete_many({"is_dummy": {"$ne": True}})
    
    print(f"TACTICAL WIPE: {result.deleted_count} user events removed. AI Brain preserved.")
    return {"status": "success", "message": f"Cleared {result.deleted_count} events."}

# --- THE AI AGENT ---
@app.post("/api/schedule/nlp")
def nlp_auto_schedule(req: NLPRequest):
    today = datetime.now().strftime("%A, %Y-%m-%d")
    
    system_instruction = f"""
    You are a Strategic Project Manager. Today: {today}.
    1. DECOMPOSITION: Break large total times (like '12 hours') into 2-3 hour chunks.
    2. DURATION: Convert minutes to fractions of an hour (e.g., 45 mins = 0.75).
    3. TYPES: Use ONLY ['Class', 'Study', 'Project', 'Fitness', 'Recovery', 'Social', 'Admin', 'Other'].
    4. DATE MAPPING: If a deadline is mentioned (like '28th'), prioritize dates BEFORE it.
    5. TITLE HACK: You MUST include the target date number in the title (e.g., 'Study (27th)').
    6. TIME-LOCKING: If the user asks for a specific time (e.g., "at 8 PM"), set `target_hour` to that exact 24-hour integer (e.g., 20). If time-locked, DO NOT decompose the task into chunks. Leave it whole. If no exact time, set `target_hour` to -1.
    7. KEYS REQUIRED: Your JSON objects MUST contain exactly these keys: title, duration_hours, type, subject, cognitive_load (1-10), priority (1-5), target_hour.
    Output ONLY a raw JSON array. Do not include markdown formatting.
    """
    
    try:
        response = client_ai.models.generate_content(
            model='gemini-2.5-flash', 
            contents=req.user_prompt,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction, 
                response_mime_type='application/json'
            )
        )
        raw_ai_text = response.text.strip()
        
        # Safe markdown stripping
        if raw_ai_text.startswith("```"):
            raw_ai_text = raw_ai_text.strip("`").strip()
        if raw_ai_text.lower().startswith("json"):
            raw_ai_text = raw_ai_text[4:].strip()

        data = json.loads(raw_ai_text)
        print("Strategy Executed via: GEMINI")
        goals = [Goal(**g) for g in (data if isinstance(data, list) else [data])]
        return auto_schedule(AutoScheduleRequest(goals=goals, start_date=req.start_date))

    except Exception as e:
        error_msg = str(e)
        
        # FIX: We added "400" and "INVALID_ARGUMENT" to the list of triggers so your fake key test works!
        if "429" in error_msg or "RESOURCE_EXHAUSTED" in error_msg or "503" in error_msg or "400" in error_msg or "INVALID_ARGUMENT" in error_msg:
            print(f"Gemini failed or exhausted. Rerouting to ENGINE 2: GROQ...")
            
            groq_key = os.getenv("GROQ_API_KEY")
            if not groq_key: 
                return {"status": "error", "message": "No fallback key."}
                
            headers = {"Authorization": f"Bearer {groq_key}", "Content-Type": "application/json"}
            payload = {
                "model": "llama-3.1-8b-instant", 
                "messages": [{"role": "system", "content": system_instruction}, {"role": "user", "content": req.user_prompt}]
            }
            
            try:
                groq_res = requests.post("https://api.groq.com/openai/v1/chat/completions", headers=headers, json=payload)
                groq_res.raise_for_status() 
                groq_data = groq_res.json()
                
                raw_text = groq_data['choices'][0]['message']['content'].strip()
                
                if raw_text.startswith("```"):
                    raw_text = raw_text.strip("`").strip()
                if raw_text.lower().startswith("json"):
                    raw_text = raw_text[4:].strip()
                    
                data = json.loads(raw_text)
                print("Strategy Executed via: GROQ")
                goals = [Goal(**g) for g in (data if isinstance(data, list) else [data])]
                return auto_schedule(AutoScheduleRequest(goals=goals, start_date=req.start_date))
                
            except Exception as groq_error:
                print(f"GROQ ENGINE FAILED: {groq_error}")
                return {"status": "error", "message": "Both engines failed."}
        else:
            print(f"Unhandled Gemini Error: {error_msg}")
            return {"status": "error", "message": error_msg}

# --- ANALYTICS ---
@app.get("/api/analysis/focus-metrics")
def get_focus_metrics():
    events = list(events_collection.find({"status": "Completed"}))
    if not events: return []
    df = pd.DataFrame(events).dropna(subset=['focusScore', 'cognitiveLoad'])
    return df.groupby('cognitiveLoad')['focusScore'].mean().round(1).reset_index().to_dict(orient="records")

@app.get("/api/analysis/priority-distribution")
def get_priority_distribution():
    events = list(events_collection.find())
    if not events: return []
    df = pd.DataFrame(events)
    if 'priority' not in df.columns: return []
    priority_counts = df['priority'].value_counts().reset_index()
    priority_counts.columns = ['priority', 'count']
    return priority_counts.sort_values('priority', ascending=False).to_dict(orient="records")

@app.post("/api/predict/focus")
def predict_focus(req: PredictRequest):
    model = train_predictive_model()
    if not model: return {"predicted_focus": 5.0, "warning": False}
    p = float(model.predict([[req.cognitive_load, req.hour_of_day]])[0])
    p = round(p, 1)
    return {"predicted_focus": p, "warning": bool(p < 5.0)}
- Sync type defs between frontend and backend
- Tidy type defs, frontend and backend
- Try to eliminate `grep -r "\[[\"\'][A-Za-z0-9_]\+[\"\']\]" src`
- Remove firebase from direct use, particularly in frontend using `grep -r "fire\(base\|store\)" src`
- Unify persistence
- Eliminate one of response or response_stream
- Fix corpus_available in persona thingy I messed up
- Global model selector
- Project embedding selector
- File metadate no longer contains file_path or timestamp but does contain filename
- Prune requirements
- Sort WritingInterface feedback stuff
- Look at the .env stuff, pruning and tidying

AI suggests:

  High value                                                                                             
                                                                                                         
  2. Redundant except HTTPException as e: raise e (personas.py x5)                                       
  Catching and immediately re-raising an exception does nothing. FastAPI propagates HTTPException        
  automatically.                                                                                         
                                                                                                         
  4. Empty auto-save interval (App.tsx:115–117)                                                          
  A setInterval fires every 3 seconds and does nothing — the body is just // TODO auto save. Wastes CPU, 
  should be removed until implemented.                                                                   
                                                                                                         
  5. Wrong status codes on GET endpoints (projects.py)                                                   
  Two GET endpoints declare status_code=201 (Created). Should be 200 or omitted.
                                                                                                         
  ---             
  Medium value                                                                                           
                  
  6. ToolCall vs ToolUse duplication (agent/base.py)
  Two nearly-identical NamedTuples; the author even left a # TODO should this just be the same? comment  
  on one of them.                                                                                        
                                                                                                         
  7. Dynamic config mutation per request (analysis.py:350–359)                                           
  Personas are inserted into a global config object inside each WebSocket handler. The TODO acknowledges
  this is wrong — the persona should just be passed directly.                                            
                  
  8. Boilerplate try/catch in every service method (animaService.ts, projectService.ts x~15)             
  Every method wraps with try/catch, logs, then re-throws unchanged. The logging adds no value at the
  service layer (the caller has to handle the error anyway); the catch blocks can just be removed.       
                  
  9. parse_json_feedback is 250 lines (analysis.py:48–300)                                               
  It has cascading fallbacks for 8+ alternate field names per attribute because models return
  inconsistent schemas. This is a symptom of not enforcing a structured output schema — fixing that      
  upstream would let this function collapse to ~20 lines.
                                                                                                         
  ---                                                                                                    
  Low value / easy fixes
                                                                                                         
  10. Bare except: clauses (personas.py x2, analysis.py x2) — should be except Exception:
                                                                                                         
  12. Unused setAnalysisStatus state setter (WritingInterface.tsx:55) — declared but never read          

- Proactively load qdrant, seems to be hanging and is nasty to be lazy
- Fix zombie qdrant
- Deal with failure during global init, particularly config failing to parse
- Check config is actually how it should be

- It seems that clicking editor when purpose is blank does nothing
- AnimaUpdate is dead code?
- Progress in CorpusUploadModal has no right margin
- Bundle Qdrant
- The jump to referenced thing is misaligned for some reason
- Thinking progress would be nice
- AnimaChat has a lot of ? and ||, hmm
- Tidy type defs, frontend and backend
- Look at local storage
- Eliminate one of response or response_stream
- Fix corpus_available in persona thingy I messed up
- Global model selector
- File metadate no longer contains timestamp, look at the instances of this
- Sort WritingInterface feedback stuff
- Look at the .env stuff, pruning and tidying
- Audit noqa


Feedback Item field JT comments:
- render confidence probably?

Feedback Item field AI comments:

  Inherited from ReceivedFeedbackItem (come from the backend):
  - id — used as React key, for dismiss/resolve callbacks, and in
  history records
  - type — drives the icon (intellectual, stylistic,
  complex_suggestion, etc.) and card styling
  - severity — drives card border/background colour
  (high/medium/low)
  - category — stored in feedback history records only
  - title — rendered as the card heading
  - content — rendered as the card body (markdown)
  - confidence — present in the type but never read anywhere in
  the UI
  - model — shown as a small monospace tag on the card
  - sources — fallback list of plain-string corpus references,
  shown only when corpus_sources is empty
  - corpus_sources — rich corpus grounding, rendered as clickable
  excerpt cards with source_file and relevance
  - positions — used to show the referenced text snippet and
  enable "jump to reference"; positions[0].text also falls back to
   quote in history records

  Added by the frontend (EnrichedFeedbackItem extras):
  - agent — display name shown in the card header; falls back when
   animaName is absent; stored in history records
  - animaName — preferred over agent for display; set when
  feedback comes from an anima
  - timestamp — set at enrichment time; stored in history records
  but not rendered in the card
  - status — drives card styling (active, resolved, retracted,
  dismissed) and whether action buttons show
  - source — set to "anima" at enrichment; never read anywhere
  after that
  - suggestion — in the type but never read anywhere
  - quote — fallback in history records when positions[0].text is
  absent; never rendered in the card itself
  - resolvedAt — in the type but never read anywhere

  So confidence, suggestion, source (the enrichment one), and
  resolvedAt appear to be dead fields.


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

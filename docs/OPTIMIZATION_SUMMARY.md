# Writing-Anima Optimization Summary

## Quick Wins Implemented ✅

### 1. Structured JSON Output

**What Changed:**
- Added `use_json_mode` parameter to OpenAIAgent
- Modified `_call_model()` to include `response_format: {"type": "json_object"}`
- Created `parse_json_feedback()` function to parse structured responses

**Benefits:**
- ✅ Native structured output (no fragile text parsing)
- ✅ Accurate type classification (issue/suggestion/praise/question)
- ✅ Proper category assignment (clarity/style/logic/evidence/structure/voice/craft)
- ✅ Real confidence scores from model
- ✅ Corpus chunk references tracked

**Files Modified:**
- `backend/src/agent/openai_agent.py` - Added JSON mode support
- `backend/src/api/analysis.py` - Replaced text parser with JSON parser

### 2. Writing-Specific System Prompt

**What Changed:**
- Created new `writing_critic.txt` prompt template
- Positioned AI as a critical reader (not style emulator)
- Added comprehensive feedback guidelines
- Specified 7 feedback categories with detailed explanations
- Included balance requirements (60% criticism, 40% praise)

**Key Differences from Original:**

| Aspect | Original (`base.txt`) | New (`writing_critic.txt`) |
|--------|----------------------|---------------------------|
| **Purpose** | Write AS the persona | Critique FROM persona's perspective |
| **Voice** | First person ("I argue...") | Third person analysis ("In your work...") |
| **Output** | Prose in persona's style | Structured JSON feedback |
| **Focus** | Style emulation | Critical engagement |
| **Context** | 160 chunks (content + style) | 160 chunks (topic + style + quality examples) |

**New Retrieval Strategy:**
```
STAGE 1 - Content & Context (k=60):
  → Topic-related passages
  → How persona approaches similar subjects

STAGE 2 - Style Examples (k=60):
  → Writing in similar contexts
  → Stylistic patterns

STAGE 3 - Critical Standards (k=40):
  → Quality demonstrations
  → Strong argumentation examples
  → Implicit standards of excellence
```

**Files Created:**
- `backend/src/agent/prompts/writing_critic.txt` - Complete new prompt

**Files Modified:**
- `backend/src/agent/base.py` - Made prompt file configurable
- `backend/src/api/analysis.py` - Uses `writing_critic.txt` instead of `base.txt`

### 3. Corpus Source Tracking

**What Changed:**
- JSON format includes `corpus_references` field
- Frontend FeedbackItem model supports `sources` array
- Each feedback item tracks which corpus chunks were used

**Benefits:**
- ✅ Transparency: Users see what corpus supports each point
- ✅ Verifiability: Can validate feedback against original text
- ✅ Learning: Understand what the persona values based on citations

**Example Feedback with Sources:**
```json
{
  "type": "issue",
  "category": "clarity",
  "title": "Ambiguous pronoun reference in paragraph 2",
  "content": "The pronoun 'it' could refer to either...",
  "severity": "high",
  "confidence": 0.9,
  "corpus_references": ["chunk_23", "chunk_67"],
  "suggested_revision": "The methodology demonstrates..."
}
```

## System Prompt Deep Dive

### Critical Engagement Features

**1. Feedback Types with Guidelines:**
```
ISSUE: Problems that weaken writing
  - Unclear passages, weak arguments
  - Logical fallacies, missing evidence
  - Severity: HIGH for critical problems

SUGGESTION: Opportunities for improvement
  - Alternative phrasings, structural changes
  - Additional evidence needed
  - Severity: MEDIUM for enhancements

PRAISE: What's working well
  - Effective passages, strong arguments
  - Severity: LOW (positive reinforcement)

QUESTION: Prompts for deeper thinking
  - Unexplored implications
  - Potential counter-arguments
```

**2. Seven Feedback Categories:**
- **Clarity**: Accessibility of meaning, term definitions
- **Style**: Word choice, rhythm, voice consistency
- **Logic**: Argument structure, evidence support
- **Evidence**: Sufficiency, relevance, citation quality
- **Structure**: Organization, intro/conclusion effectiveness
- **Voice**: Tone appropriateness, persona consistency
- **Craft**: Technique, rhetorical devices, memorable phrasing

**3. Actionability Requirements:**
Every suggestion must:
- Point to SPECIFIC passages (by quoting)
- Provide CONCRETE alternatives
- Reference CORPUS EXAMPLES as models
- Suggest NEXT STEPS for revision

**Bad (vague):**
```json
{
  "content": "This could be clearer. Try to improve it."
}
```

**Good (specific and actionable):**
```json
{
  "title": "Dense opening sentence obscures main claim",
  "content": "The sentence 'While numerous perspectives...' front-loads too many qualifications. In your blog posts, you typically state claims directly first, THEN qualify. For example, in [post X]: 'AI alignment is hard. Not because...' Consider: 'The problem is interpretability. While numerous perspectives...'",
  "corpus_references": ["chunk_42", "chunk_89"],
  "suggested_revision": "The problem is interpretability. While numerous perspectives exist..."
}
```

### Confidence Scoring System

Based on corpus support:
- **0.9-1.0**: Multiple clear corpus examples directly support this
- **0.7-0.8**: Strong corpus patterns, some clear examples
- **0.5-0.6**: Inference from corpus, fewer direct examples
- **0.3-0.4**: Weak corpus support, more general observation
- **0.0-0.2**: Limited/no corpus support (use sparingly)

### Dialectical Engagement

Engages with IDEAS, not just surface features:
- What assumptions does writing make?
- What counter-arguments are unaddressed?
- What implications are unexplored?
- How could the argument be strengthened?

References persona's intellectual approach:
```
"You often consider the counter-argument that... Is there a similar objection here?"
"In your work on X, you show how Y leads to Z. Does this reasoning apply here?"
"This reminds me of the problem you identified in [work]. Have you considered the parallel?"
```

## Technical Implementation

### JSON Mode Integration

**In OpenAIAgent:**
```python
def __init__(
    self,
    persona_id: str,
    use_json_mode: bool = False,
    prompt_file: str = "base.txt"
):
    self.use_json_mode = use_json_mode
    self.prompt_file = prompt_file

def _call_model(self, system: str, messages: List[Dict]) -> Any:
    api_params = {...}

    if self.use_json_mode:
        api_params["response_format"] = {"type": "json_object"}

    return self.client.chat.completions.create(**api_params)
```

**In Analysis API:**
```python
# Create agent with JSON mode and critic prompt
agent = OpenAIAgent(
    persona_id=request.persona_id,
    config=persona_config,
    model=config.model.primary,
    use_json_mode=True,
    prompt_file="writing_critic.txt"
)
```

### Robust JSON Parsing

Handles multiple response formats:
```python
def parse_json_feedback(response_text: str):
    # 1. Try direct JSON parse
    feedback_data = json.loads(response_text)

    # 2. Handle wrapped responses
    if isinstance(feedback_data, dict):
        for key in ['feedback', 'items', 'analysis']:
            if key in feedback_data:
                feedback_data = feedback_data[key]

    # 3. Fallback: regex extract JSON array
    if not isinstance(feedback_data, list):
        json_match = re.search(r'\[.*\]', response_text, re.DOTALL)
        if json_match:
            feedback_data = json.loads(json_match.group(0))

    # 4. Parse each item with error handling
    for item in feedback_data:
        try:
            feedback_items.append(FeedbackItem(...))
        except Exception as e:
            logger.error(f"Skipping invalid item: {e}")
            continue
```

### Prompt File Selection

Made base agent prompt configurable:
```python
def _build_system_prompt(self, prompt_file: str = "base.txt") -> str:
    prompt_dir = Path(self.config.agent.system_prompt_dir)
    base_prompt_path = prompt_dir / prompt_file
    ...

def respond(self, query: str, ...) -> Dict:
    # Use custom prompt if agent has one
    prompt_file = getattr(self, 'prompt_file', 'base.txt')
    system_prompt = self._build_system_prompt(prompt_file)
```

## Expected Improvements

### Before (Simple Text Parsing):
```
User: [Writes 500-word essay]
↓
Anima: Returns unstructured text
↓
Parser: Splits by paragraphs, infers types from keywords
↓
Result:
  - 3-5 vague feedback items
  - Generic categories ("general")
  - Hardcoded confidence (0.8)
  - No corpus references
  - No suggested revisions
```

### After (Structured JSON Output):
```
User: [Writes 500-word essay]
↓
Anima: Returns structured JSON with critical analysis
↓
Parser: Direct JSON parsing
↓
Result:
  - 5-10 specific feedback items
  - Precise categories (clarity, logic, evidence, etc.)
  - Model-provided confidence (0.3-1.0)
  - Corpus chunk references for verification
  - Concrete suggested revisions
  - Mix of issues (60%), praise (40%)
```

## Example Output Comparison

### Before:
```json
{
  "type": "suggestion",
  "category": "general",
  "title": "Consider revising the opening paragraph for better flow.",
  "content": "Consider revising the opening paragraph for better flow. It could be improved.",
  "severity": "medium",
  "confidence": 0.8,
  "sources": []
}
```

### After:
```json
{
  "type": "issue",
  "category": "clarity",
  "title": "Dense technical jargon in opening sentence alienates readers",
  "content": "The opening 'The phenomenological reduction qua methodological epoché...' assumes specialized knowledge. In your blog posts, you consistently define technical terms on first use. See chunk_45 where you wrote: 'Dasein—Heidegger's term for human being—means...' Consider: 'The phenomenological reduction (a method of bracketing assumptions) reveals...'",
  "severity": "high",
  "confidence": 0.92,
  "corpus_references": ["chunk_45", "chunk_78", "chunk_103"],
  "suggested_revision": "The phenomenological reduction (a method of bracketing assumptions) reveals consciousness in its pure form."
}
```

## Testing the Optimizations

### 1. Verify JSON Output

Start backend and check logs:
```bash
python backend/main.py
# Look for: "Initialized OpenAIAgent with model: gpt-4o, JSON mode: True"
```

### 2. Test Analysis Endpoint

```bash
curl -X POST http://localhost:8000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "content": "AI is complicated. It has many issues. We should fix them.",
    "persona_id": "<your-persona-id>",
    "user_id": "<your-user-id>",
    "max_feedback_items": 5
  }'
```

Expected response: JSON array with properly structured feedback items.

### 3. Test via Frontend

1. Create persona with corpus
2. Write short text
3. Click "Analyze with Anima"
4. Check browser console for feedback structure
5. Verify feedback cards show:
   - Specific categories (not just "general")
   - Varied confidence scores
   - Actionable suggestions

### 4. Verify Corpus References

Check backend logs for:
```
INFO: Parsed 7 feedback items from JSON
```

Check frontend console for feedback items with `sources` arrays.

## Troubleshooting

### Issue: "Failed to parse JSON feedback"

**Cause**: Model didn't return valid JSON

**Solutions:**
1. Check backend logs for raw response
2. Verify `use_json_mode=True` is set
3. Check if prompt clearly requests JSON output
4. May need to increase temperature or adjust model

### Issue: Empty feedback array

**Cause**: JSON structure not matching expected format

**Solutions:**
1. Check raw response in logs
2. Verify parser handles wrapped responses
3. May need to adjust parsing logic

### Issue: Generic categories

**Cause**: Old parsing function still being used

**Solutions:**
1. Verify `parse_json_feedback()` is called (not `convert_anima_to_feedback()`)
2. Check agent uses `writing_critic.txt` prompt
3. Restart backend to reload changes

## Future Enhancements

### Next Steps (Not Yet Implemented):

1. **FeedbackEmitterTool**: Allow agent to emit feedback items as separate tool calls
2. **Chunk Detail Display**: Show actual corpus text when user clicks a source reference
3. **Confidence-based Filtering**: Let users filter by confidence threshold
4. **Category-based Views**: Group feedback by category
5. **Revision Tracking**: Track which suggestions were accepted/rejected
6. **Multi-persona Comparison**: Get feedback from multiple personas simultaneously

## Summary

The quick wins provide:
- ✅ **Better Structure**: Native JSON instead of text parsing
- ✅ **Better Prompting**: Writing-specific critical engagement
- ✅ **Better Transparency**: Corpus source tracking
- ✅ **Better Actionability**: Concrete examples and revisions
- ✅ **Better Balance**: Mix of praise and criticism
- ✅ **Better Categorization**: 7 specific categories vs. generic
- ✅ **Better Confidence**: Model-provided scores vs. hardcoded

All without modifying Anima's core orchestration logic! 🎯

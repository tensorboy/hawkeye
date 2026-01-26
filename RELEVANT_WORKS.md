# Relevant Works - AI Computer Control Projects

> 本文档分析了 9 个 AI 电脑控制开源项目，评估其与 Hawkeye 的集成潜力。

## Overview Table

| Project | Stars | Core Innovation | Integration Priority | Key Value |
|---------|-------|-----------------|---------------------|-----------|
| [Open Interpreter](https://github.com/OpenInterpreter/open-interpreter) | 61K+ | Multi-language code execution + LiteLLM | **HIGH** | Provider abstraction, Computer API |
| [OmniParser](https://github.com/microsoft/OmniParser) | 15K+ | YOLO + Florence-2 screen parsing | **HIGH** | Visual perception pipeline |
| [Self-Operating Computer](https://github.com/OthersideAI/self-operating-computer) | 9K+ | PyAutoGUI + Set-of-Mark prompting | **HIGH** | Coordinate-based targeting |
| [Agent-S](https://github.com/simular-ai/Agent-S) | 3K+ | Dual memory + ACI design | **MEDIUM** | Cognitive architecture |
| [UFO](https://github.com/microsoft/UFO) | 3K+ | Windows UI Automation + COM APIs | **MEDIUM** | Windows deep integration |
| [Cradle](https://github.com/BAAI-Agents/Cradle) | 2K+ | Vision-first, no-API approach | **MEDIUM** | Game/software control |
| [OS-Copilot](https://github.com/OS-Copilot/OS-Copilot) | 3K+ | FRIDAY agent + self-learning | **MEDIUM** | Adaptive tool learning |
| [ShowUI](https://github.com/showlab/ShowUI) | 2K+ | Lightweight VLA model | **HIGH** | On-device inference |
| [UI-TARS](https://github.com/bytedance/UI-TARS-Desktop) | 12K+ | End-to-end vision-language model | **HIGH** | Desktop automation |

---

## 1. Open Interpreter

> **Repository**: https://github.com/OpenInterpreter/open-interpreter
> **Stars**: 61K+ | **License**: AGPL-3.0

### Core Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Open Interpreter                         │
├─────────────────────────────────────────────────────────────┤
│  OpenInterpreter Class (core.py)                           │
│  ├── LLM Layer (LiteLLM - 100+ providers)                  │
│  ├── Computer Module (15+ subsystems)                       │
│  └── Terminal Layer (multi-language execution)             │
└─────────────────────────────────────────────────────────────┘
```

### Key Innovations

1. **Multi-Language Code Execution**
   - Python (Jupyter kernel-based, stateful)
   - Shell (platform-aware subprocess)
   - JavaScript (Node.js)
   - HTML/React (browser rendering)

2. **LiteLLM Provider Abstraction**
   ```python
   # Unified interface for 100+ providers
   interpreter.llm.api_base = "http://localhost:11434/v1"  # Ollama
   interpreter.llm.model = "openai/mistral-7b"
   ```

3. **Computer API (15+ Subsystems)**
   ```
   computer.
   ├── terminal (code execution)
   ├── display (screenshot, OCR with Moondream + EasyOCR)
   ├── mouse/keyboard (pyautogui automation)
   ├── browser (Selenium-based)
   ├── files (filesystem operations)
   ├── os (system operations)
   ├── clipboard (copy/paste)
   └── ai (embedded LLM calls)
   ```

4. **Safety Mechanisms**
   - User approval prompts before code execution
   - Semgrep-based vulnerability scanning
   - Blocked command patterns (rm -rf, sudo rm, mkfs)

### Hawkeye Integration Opportunities

| Component | Current Hawkeye | Open Interpreter Value |
|-----------|----------------|----------------------|
| AI Provider | Ollama, Gemini, OpenAI-compatible | LiteLLM for 100+ providers |
| Code Execution | Shell only | Multi-language (Python, JS, Shell) |
| Vision | OCR-based | Moondream (tiny local VLM) |
| Browser | Chrome DevTools MCP | Selenium + accessibility tree |

**Recommended Actions**:
- Adopt LiteLLM pattern for provider management
- Integrate Computer API as MCP tools
- Use Moondream for lightweight local vision

---

## 2. OmniParser (Microsoft)

> **Repository**: https://github.com/microsoft/OmniParser
> **Stars**: 15K+ | **License**: MIT

### Screen Parsing Pipeline

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   Detect     │ → │   Caption    │ → │   Ground     │
│   (YOLO)     │    │ (Florence-2) │    │ (Coordinates)│
└──────────────┘    └──────────────┘    └──────────────┘
     │                    │                    │
     ▼                    ▼                    ▼
  Bounding         Element           Normalized
  Boxes            Descriptions       JSON Output
```

### Key Innovations

1. **YOLO for UI Element Detection**
   - YOLOv8 trained on UI elements
   - Single-pass detection (~0.5s per image)
   - Handles buttons, text fields, dropdowns, links

2. **Florence-2/BLIP-2 Captioning**
   - Instruction-following capability
   - Generates actionable descriptions
   - Example: "Click here to submit the form"

3. **Structured Output for LLMs**
   ```json
   {
     "elements": [
       {
         "id": "elem_0",
         "type": "button",
         "bbox": {"x": 0.35, "y": 0.45, "width": 0.15, "height": 0.05},
         "caption": "Submit button",
         "confidence": 0.98
       }
     ]
   }
   ```

### Hawkeye Integration Opportunities

**Current Gap**: Hawkeye's OCR extracts text but doesn't identify UI element types or provide semantic descriptions.

**Recommended Integration**:
```typescript
// Enhance perception engine
interface OmniParserResult {
  elements: UIElement[];
  layout: string;
}

// Replace OCR with OmniParser pipeline
async perceive(): Promise<ExtendedPerceptionContext> {
  const screenshot = await this.captureScreen();
  const parsed = await omniParser.parse(screenshot); // NEW
  return { screenshot, parsedUI: parsed };
}
```

---

## 3. Self-Operating Computer

> **Repository**: https://github.com/OthersideAI/self-operating-computer
> **Stars**: 9K+ | **License**: MIT

### Core Architecture

```
┌─────────────────────────────────────────────────────────────┐
│              Self-Operating Computer Framework              │
├─────────────────────────────────────────────────────────────┤
│  Screen Capture → Vision Analysis → Action Generation       │
│  ├── PyAutoGUI (mouse/keyboard control)                     │
│  ├── Set-of-Mark prompting (visual markup)                  │
│  └── Coordinate hashing (persistence)                       │
└─────────────────────────────────────────────────────────────┘
```

### Key Innovations

1. **Set-of-Mark (SoM) Prompting**
   - Visual markup with numbered boxes on UI elements
   - Each mark maps to precise coordinates
   - LLM references elements by mark number

2. **Coordinate Hash System**
   ```python
   # Persistent coordinate storage
   mark_hash = sha256(element_ref + bbox)
   coordinates[mark_hash] = {x, y, success_count}
   ```

3. **Multi-Level Targeting Strategy**
   - Primary: Direct coordinates from vision
   - Secondary: Bounding box centers
   - Tertiary: Element name search via OCR

4. **Voice Mode**
   - Real-time speech-to-text
   - Context-aware command interpretation

### Hawkeye Integration Opportunities

**Critical Gap**: Hawkeye lacks direct mouse/keyboard control and coordinate-based targeting.

**Recommended Implementation**:
```typescript
// packages/core/src/execution/pointer-control.ts
interface PointerControl {
  moveTo(x: number, y: number): Promise<void>;
  click(x: number, y: number): Promise<void>;
  smartClick(element: UIElement): Promise<boolean>;
}

// packages/core/src/execution/mark-system.ts
interface CoordinateMark {
  id: string;
  location: {x: number, y: number};
  hash: string;
  successCount: number;
}
```

---

## 4. Agent-S

> **Repository**: https://github.com/simular-ai/Agent-S
> **Stars**: 3K+ | **License**: Apache-2.0

### Cognitive Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Agent-S Framework                      │
├─────────────────────────────────────────────────────────────┤
│  Hierarchical Planning                                      │
│  ├── Task Decomposition (LLM-based)                         │
│  ├── Experience Enhancement (from memory)                   │
│  └── Adaptive Refinement (feedback loop)                    │
├─────────────────────────────────────────────────────────────┤
│  Dual Memory System                                         │
│  ├── Narrative Memory (semantic task understanding)         │
│  └── Episodic Memory (step-by-step action records)          │
├─────────────────────────────────────────────────────────────┤
│  Agent-Computer Interface (ACI)                             │
│  ├── Screen Perception                                      │
│  ├── Action Abstraction                                     │
│  └── State Representation                                   │
└─────────────────────────────────────────────────────────────┘
```

### Key Innovations

1. **Dual Memory Mechanism**
   - **Narrative**: High-level semantic descriptions
   - **Episodic**: Detailed action-outcome pairs
   - Integration: Both inform planning and execution

2. **Experience-Enhanced Planning**
   - Retrieves similar past scenarios
   - Adapts successful patterns to new tasks
   - Learns from failures to avoid repetition

3. **ACI Design Principles**
   - Clear separation: perception ↔ reasoning ↔ action
   - State abstraction independent of specific apps
   - Composable action primitives

### Hawkeye Integration Opportunities

**Recommended Enhancements**:

1. **Add Dual Memory to Storage**
   ```typescript
   // packages/core/src/storage/memory.ts
   interface DualMemory {
     narrative: NarrativeStore;  // High-level task understanding
     episodic: EpisodicStore;    // Step-by-step records
   }
   ```

2. **Experience-Enhanced Plan Generation**
   ```typescript
   async generatePlan(intent: UserIntent): Promise<ExecutionPlan> {
     const relevantExperiences = await this.memory.retrieve(intent);
     const plan = await this.llm.plan(intent, relevantExperiences);
     return plan;
   }
   ```

---

## 5. UFO (Microsoft)

> **Repository**: https://github.com/microsoft/UFO
> **Stars**: 3K+ | **License**: MIT

### Windows-Specific Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     UFO Framework                           │
├─────────────────────────────────────────────────────────────┤
│  Dual-Agent Architecture                                    │
│  ├── AppAgent (high-level reasoning)                        │
│  └── OSWorld Agent (low-level execution)                    │
├─────────────────────────────────────────────────────────────┤
│  Windows Integration                                        │
│  ├── UI Automation API (control tree)                       │
│  ├── Win32 API (window management)                          │
│  └── COM APIs (Office automation)                           │
└─────────────────────────────────────────────────────────────┘
```

### Key Innovations

1. **Control Tree vs Screenshot**
   ```
   Screenshot:  Visual → OCR → fuzzy matching → coordinates → click
   Control Tree: API → structured object → deterministic ID → invoke
   ```

2. **Dual-Agent Architecture**
   - **AppAgent**: Understands business tasks, plans action sequences
   - **OSWorld Agent**: Reads control trees, executes actions with retry

3. **COM API for Office**
   ```python
   # Direct object model access (no clicking!)
   excel = win32com.client.Dispatch("Excel.Application")
   value = excel.ActiveSheet.Range("B5").Value
   ```

### Hawkeye Integration Opportunities

**Windows-Specific Enhancements**:

1. **Add Control Tree Reading**
   ```typescript
   // packages/core/src/perception/control-tree.ts
   interface UIAControl {
     automationId: string;
     controlType: string;
     name: string;
     boundingRect: {x, y, width, height};
     children: UIAControl[];
   }
   ```

2. **Dual-Agent Split**
   ```typescript
   // packages/core/src/ai/agents/
   class AppAgent {
     async planTask(request: string): Promise<ActionPlan>;
   }
   class OSWorldAgent {
     async executeAction(action: Action): Promise<ExecutionResult>;
   }
   ```

---

## 6. Cradle (BAAI)

> **Repository**: https://github.com/BAAI-Agents/Cradle
> **Stars**: 2K+ | **License**: MIT

### Vision-First Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Cradle Framework                         │
├─────────────────────────────────────────────────────────────┤
│  No-API Philosophy: All via visual perception               │
├─────────────────────────────────────────────────────────────┤
│  Memory System                                              │
│  ├── Short-term (working context, last N frames)            │
│  └── Long-term (RAG knowledge base)                         │
├─────────────────────────────────────────────────────────────┤
│  Self-Reflection                                            │
│  ├── Failure detection via vision                           │
│  ├── Strategy correction via LLM reasoning                  │
│  └── Iterative improvement                                  │
└─────────────────────────────────────────────────────────────┘
```

### Key Innovations

1. **Vision-First Approach**
   - Works with any software that renders to screen
   - No API/SDK integration required
   - Adapts to UI changes automatically

2. **Dual Memory with RAG**
   - **Short-term**: Current task state, recent observations
   - **Long-term**: Task templates, UI patterns, failure solutions
   - **RAG retrieval**: Query similar past scenarios

3. **Self-Reflection Loop**
   ```
   Plan → Action → Observe
       ↓
   Compare (expected vs actual)
       ↓
   Reflect & Correct
   ```

4. **Game/Software Control (RDR2, Cities Skylines, CapCut)**
   - Handles real-time dynamics
   - 3D scene understanding
   - Cross-application generalization

### Hawkeye Integration Opportunities

**Recommended Enhancements**:

1. **RAG-Augmented Memory**
   ```typescript
   // packages/core/src/storage/rag-memory.ts
   interface RAGMemory {
     async store(experience: TaskExperience): Promise<void>;
     async retrieve(query: string, topK: number): Promise<TaskExperience[]>;
   }
   ```

2. **Self-Reflection Module**
   ```typescript
   // packages/core/src/reasoning/reflection.ts
   class ReflectionEngine {
     async detectFailure(expected: State, actual: State): Promise<Failure | null>;
     async correctStrategy(failure: Failure): Promise<AlternativePlan>;
   }
   ```

---

## 7. OS-Copilot (FRIDAY)

> **Repository**: https://github.com/OS-Copilot/OS-Copilot
> **Stars**: 3K+ | **License**: Apache-2.0

### FRIDAY Agent Architecture

```
┌─────────────────────────────────────────────────────────────┐
│               FRIDAY Agent Architecture                     │
├─────────────────────────────────────────────────────────────┤
│  Flexible, Rapid, Interactive, Dialogue-driven, Adaptive    │
├─────────────────────────────────────────────────────────────┤
│  Core Modules                                               │
│  ├── Perception (screenshot + metadata)                     │
│  ├── Planning (task decomposition)                          │
│  ├── Action (keyboard/mouse control)                        │
│  └── Memory (action history + learning)                     │
├─────────────────────────────────────────────────────────────┤
│  Self-Learning                                              │
│  ├── Trajectory learning (from execution history)           │
│  ├── Tool learning (discover new capabilities)              │
│  └── Few-shot application (from memory)                     │
└─────────────────────────────────────────────────────────────┘
```

### Key Innovations

1. **Self-Learning Mechanisms**
   - Records all interaction sequences
   - Builds dynamic knowledge base of successful patterns
   - Improves accuracy through task outcome feedback

2. **Tool Learning Approach**
   - Explores UI systematically
   - Maps UI elements to functions
   - Transfers knowledge between similar applications

3. **Multi-Level Memory**
   - **Short-term**: Current task + immediate history
   - **Mid-term**: Recent successful patterns
   - **Long-term**: Generalized skills

### Hawkeye Integration Opportunities

**Trajectory-Based Learning**:
```typescript
// packages/core/src/learning/trajectory.ts
interface ActionTrajectory {
  task: string;
  steps: {screenshot: Buffer, action: Action, result: Result}[];
  success: boolean;
}

class TrajectoryLearner {
  async record(trajectory: ActionTrajectory): Promise<void>;
  async retrieve(task: string): Promise<ActionTrajectory[]>;
}
```

---

## 8. ShowUI

> **Repository**: https://github.com/showlab/ShowUI
> **Stars**: 2K+ | **License**: Apache-2.0

### Vision-Language-Action Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    ShowUI VLA Model                         │
├─────────────────────────────────────────────────────────────┤
│  End-to-End Design                                          │
│  ├── Vision encoder (screenshot → embeddings)               │
│  ├── Language decoder (action generation)                   │
│  └── Action head (coordinate output)                        │
├─────────────────────────────────────────────────────────────┤
│  Lightweight & Local                                        │
│  ├── 7B-13B parameters (vs 100B+ cloud models)              │
│  ├── INT8/INT4 quantization support                         │
│  └── 100-500ms inference time                               │
└─────────────────────────────────────────────────────────────┘
```

### Key Innovations

1. **Lightweight End-to-End Design**
   - Single-stage pipeline (no intermediate detection)
   - Direct coordinate prediction
   - Suitable for real-time interaction (2-5 FPS)

2. **Local Deployment**
   - Fits within 8-16GB RAM
   - No cloud dependency
   - Privacy-preserving (screenshots stay local)

3. **Comparison with Cloud Models**
   | Aspect | ShowUI | GPT-4V |
   |--------|--------|--------|
   | Size | 7-13B | 100B+ |
   | Latency | 100-500ms | 2-10s |
   | Deployment | Local | Cloud only |
   | Cost | One-time | Per-call |

### Hawkeye Integration Opportunities

**On-Device Vision Model**:
```typescript
// packages/core/src/ai/providers/showui.ts
class ShowUIProvider implements IAIProvider {
  name = 'showui';

  async analyzeScreen(screenshot: Buffer): Promise<UIAnalysis> {
    // Direct vision → action without OCR
    return this.model.infer(screenshot);
  }
}
```

---

## 9. UI-TARS (ByteDance)

> **Repository**: https://github.com/bytedance/UI-TARS-Desktop
> **Stars**: 12K+ | **License**: Apache-2.0

### End-to-End Vision-Language Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    UI-TARS Desktop                          │
├─────────────────────────────────────────────────────────────┤
│  Single-Model Processing                                    │
│  ├── Raw screenshot → VLM → Action commands                 │
│  ├── No intermediate parsing (OCR, control tree)            │
│  └── Direct pixel-to-action learning                        │
├─────────────────────────────────────────────────────────────┤
│  Desktop Application                                        │
│  ├── Electron-based                                         │
│  ├── Cross-platform (Windows, macOS)                        │
│  └── Out-of-box experience                                  │
└─────────────────────────────────────────────────────────────┘
```

### Key Innovations

1. **End-to-End Design (No Intermediate Parsing)**
   ```
   UI-TARS:  Screenshot → VLM → {action: "click", x: 100, y: 200}
   Hawkeye:  Screenshot → OCR → Intent → Plan → Shell command
   ```

2. **Unified Model Inference**
   - Single model call per screenshot
   - Lower latency, fewer failure points
   - Pixel-accurate UI understanding

3. **Desktop-First Design**
   - Optimized for desktop automation
   - Remote control support
   - Enterprise-ready scalability

### Hawkeye vs UI-TARS Comparison

| Feature | Hawkeye | UI-TARS |
|---------|---------|---------|
| **Flexibility** | Multi-model support | Single model |
| **Transparency** | Visible reasoning steps | Black-box |
| **Ecosystem** | Extensions (VS Code, Chrome) | Desktop only |
| **Latency** | Multi-step pipeline | Direct inference |
| **Visual Precision** | OCR-based | Learned from data |

### Hawkeye Integration Opportunities

**Vision-First Architecture Option**:
```typescript
// Optional direct vision → action path
class VisionDirectExecutor {
  async executeFromVision(screenshot: Buffer, task: string): Promise<Action> {
    // Single model call, no OCR/intent/plan pipeline
    return this.vlm.generateAction(screenshot, task);
  }
}
```

---

## Integration Priority Ranking

### Priority 1: Critical (Immediate Value)

| Project | Component | Integration Effort | Value |
|---------|-----------|-------------------|-------|
| **Self-Operating Computer** | Coordinate targeting system | Medium | Direct mouse control |
| **OmniParser** | YOLO + captioning pipeline | Medium | Better UI understanding |
| **ShowUI** | Lightweight VLA model | Low | On-device inference |
| **Open Interpreter** | LiteLLM provider pattern | Low | 100+ AI providers |

### Priority 2: High (Next Phase)

| Project | Component | Integration Effort | Value |
|---------|-----------|-------------------|-------|
| **UI-TARS** | End-to-end architecture | High | Lower latency |
| **UFO** | Windows control tree | Medium | Deterministic Windows automation |
| **Agent-S** | Dual memory system | Medium | Better planning |

### Priority 3: Medium (Future Enhancement)

| Project | Component | Integration Effort | Value |
|---------|-----------|-------------------|-------|
| **Cradle** | Self-reflection loop | Medium | Error recovery |
| **OS-Copilot** | Trajectory learning | Medium | Continuous improvement |

---

## Recommended Implementation Roadmap

### Phase 1 (Weeks 1-4): Foundation

1. **Coordinate-Based Targeting** (from Self-Operating Computer)
   - [ ] Implement PointerControl abstraction
   - [ ] Add coordinate hash system
   - [ ] Integrate Set-of-Mark prompting

2. **LiteLLM Integration** (from Open Interpreter)
   - [ ] Replace direct provider calls with LiteLLM
   - [ ] Support 100+ model providers

### Phase 2 (Weeks 5-8): Visual Perception

1. **OmniParser Pipeline**
   - [ ] Add YOLO-based UI detection
   - [ ] Integrate Florence-2 captioning
   - [ ] Output structured JSON for planning

2. **ShowUI Integration**
   - [ ] Add as optional vision provider
   - [ ] Enable offline UI analysis

### Phase 3 (Weeks 9-12): Advanced Features

1. **Dual Memory System** (from Agent-S)
   - [ ] Implement narrative + episodic memory
   - [ ] Add RAG retrieval for planning

2. **Windows Control Tree** (from UFO)
   - [ ] Add UI Automation wrapper
   - [ ] Support COM APIs for Office

### Phase 4 (Weeks 13-16): Optimization

1. **End-to-End Option** (from UI-TARS)
   - [ ] Add vision-direct execution path
   - [ ] Benchmark against pipeline approach

2. **Self-Learning** (from OS-Copilot)
   - [ ] Implement trajectory recording
   - [ ] Add continuous improvement loop

---

## Key Architectural Insights

### 1. Coordinate-Based Targeting is Critical

Most successful projects use direct coordinate targeting rather than element-based selection:
- Self-Operating Computer: Hash-based coordinate persistence
- OmniParser: Normalized (0-1) coordinates
- UI-TARS: Direct pixel coordinates from VLM

**Hawkeye Gap**: Currently relies on element refs from accessibility tree.

### 2. Vision-First is the Future

Modern approaches process raw screenshots without intermediate parsing:
- Cradle: No-API philosophy
- UI-TARS: End-to-end VLM
- ShowUI: Direct vision→action

**Hawkeye Opportunity**: Add optional vision-first path while keeping current pipeline.

### 3. Memory Systems Improve Over Time

Dual memory (narrative + episodic) with RAG enables continuous improvement:
- Agent-S: Dual memory with experience enhancement
- Cradle: Short-term + long-term with RAG
- OS-Copilot: Trajectory-based learning

**Hawkeye Enhancement**: Add memory layer to storage module.

### 4. Platform-Specific Optimization Matters

- UFO: Deep Windows integration (UI Automation, COM)
- Open Interpreter: Cross-platform abstraction

**Hawkeye Strategy**: Maintain cross-platform core, add platform-specific optimizations.

---

## Conclusion

The 9 analyzed projects represent the cutting edge of AI computer control. Key takeaways for Hawkeye:

1. **Adopt coordinate-based targeting** for reliable automation
2. **Integrate vision-first perception** for better UI understanding
3. **Implement dual memory** for continuous improvement
4. **Support both pipeline and end-to-end** approaches
5. **Leverage LiteLLM** for provider flexibility

By strategically integrating components from these projects, Hawkeye can evolve from an "intent-aware assistant" to a "visually-grounded automation agent" capable of reliable, human-like computer control.

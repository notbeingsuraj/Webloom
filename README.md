# 🌱 Webloom

<p align="center">
  <img src="https://img.shields.io/badge/AI--Native-Software%20Engineering-8B5CF6?style=for-the-badge" alt="AI Native">
  <img src="https://img.shields.io/badge/Status-Active%20Development-22C55E?style=for-the-badge" alt="Status">
  <img src="https://img.shields.io/badge/Architecture-Agentic-06B6D4?style=for-the-badge" alt="Agentic">
</p>

<p align="center">
  <strong>Build software by describing it.</strong>
  <br>
  <sub>Webloom transforms natural language into real, executable web applications.</sub>
</p>

<p align="center">
  <a href="#-overview">Overview</a> •
  <a href="#-how-it-works">How It Works</a> •
  <a href="#-architecture">Architecture</a> •
  <a href="#-features">Features</a> •
  <a href="#-getting-started">Getting Started</a>
</p>

---

## ✦ Overview

**Webloom** is an AI-native software development platform that turns natural-language requirements into working web applications.

It is not designed to be just another AI code generator.

Webloom combines:

- 🧠 LLM-powered reasoning
- 🧩 Project-aware context
- 🛠️ Tool-based code manipulation
- ⚡ Real application execution
- 🔍 Runtime and build inspection
- 🔧 Automated error recovery
- 🔄 Iterative development

The core idea is simple:

> **Don't just generate code. Generate software that works.**

Instead of stopping after producing code, Webloom can execute the generated application, observe what happens, understand failures, and make targeted corrections.

---

## ⚡ The Core Loop

```text
                    ┌─────────────────┐
                    │   User Prompt   │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │    Understand   │
                    │    Requirement  │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │      Plan       │
                    │  Tasks / Files  │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │     Generate    │
                    │   / Modify Code │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │     Execute     │
                    │  Build / Run    │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │     Observe     │
                    │ Logs / Errors   │
                    └────────┬────────┘
                             │
                      ┌──────┴──────┐
                      │             │
                   Success        Failure
                      │             │
                      ▼             ▼
                ┌──────────┐ ┌──────────────┐
                │ Preview  │ │    Analyze   │
                │  App     │ │    Failure   │
                └──────────┘ └───────┬──────┘
                                    │
                                    ▼
                             ┌──────────────┐
                             │    Repair    │
                             │    Project   │
                             └───────┬──────┘
                                     │
                                     └──────────────► Execute
```

This feedback loop is the foundation of Webloom.

---

# 🧠 What Makes Webloom Different?

Traditional AI coding:

```text
Prompt → LLM → Code
```

Webloom:

```text
Prompt
  ↓
Reason
  ↓
Plan
  ↓
Act
  ↓
Execute
  ↓
Observe
  ↓
Reason Again
  ↓
Repair
  ↓
Verify
```

The difference is the **execution feedback loop**.

A model can generate code that looks correct while still failing during compilation, startup, integration, or runtime.

Webloom treats those failures as additional information.

---

# ✨ Features

### 🗣️ Natural Language Development

Describe the application you want instead of manually implementing every component.

```text
Build a SaaS dashboard for managing projects.

Include:
- Authentication
- Team management
- Analytics
- Billing
- Responsive UI
- Dark mode
```

Webloom translates the requirement into an implementation workflow.

---

### 🤖 AI-Powered Code Generation

Generate and modify real project files rather than returning isolated snippets.

Webloom can work across:

- Frontend
- Backend
- APIs
- Components
- Routes
- Configuration
- Dependencies
- Application logic

---

### 🧩 Project-Aware Intelligence

Webloom works with the project as a system.

Instead of treating every request independently, the AI can reason about:

```text
Project
├── Files
├── Directories
├── Dependencies
├── Existing Components
├── Routes
├── APIs
├── Configuration
└── Runtime State
```

This allows changes to remain consistent with the existing application.

---

### 🛠️ Tool-Based Agent

The AI can interact with the development environment through controlled tools.

Typical operations include:

```text
read_file
write_file
edit_file
list_files
create_directory
install_dependency
run_command
inspect_logs
```

The model decides what needs to happen.

The backend executes the operation.

---

### ⚙️ Real Execution

Generated code is not considered complete simply because the LLM stopped talking.

Webloom can execute the project:

```text
Install
   ↓
Build
   ↓
Start
   ↓
Capture Output
   ↓
Inspect
```

This creates a real feedback channel between generated code and the AI.

---

### 🔍 Automatic Error Detection

Webloom can use execution feedback to identify issues such as:

- Syntax errors
- Type errors
- Missing modules
- Broken imports
- Dependency conflicts
- Configuration errors
- Build failures
- Runtime exceptions
- Integration failures

---

### 🔧 AI-Powered Repair

When something fails, the system can follow a targeted repair process:

```text
Error
  ↓
Locate Relevant File
  ↓
Understand Context
  ↓
Identify Root Cause
  ↓
Modify Code
  ↓
Execute Again
  ↓
Verify
```

The goal is not to regenerate the entire application because one semicolon had a philosophical disagreement with JavaScript.

---

### 🔄 Iterative Development

Webloom is designed for continuous development, not only project creation.

You can start with:

```text
Build a landing page.
```

Then continue:

```text
Add authentication.
```

Then:

```text
Add a dashboard.
```

Then:

```text
Connect the dashboard to the API.
```

Then:

```text
Fix the authentication error.
```

The project evolves through natural-language instructions.

---

# 🏗️ Architecture

```text
┌──────────────────────────────────────────────────────────┐
│                        WEBLOOM UI                        │
│                                                          │
│  Prompt │ Project │ Files │ Editor │ Preview │ Logs      │
└────────────────────────────┬─────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────┐
│                       API SERVER                         │
│                                                          │
│  Projects │ Sessions │ AI Requests │ Files │ Execution   │
└────────────────────────────┬─────────────────────────────┘
                             │
               ┌─────────────┴─────────────┐
               │                           │
               ▼                           ▼
┌─────────────────────────┐   ┌────────────────────────────┐
│     AI ORCHESTRATOR     │   │      RUNTIME ENGINE        │
│                         │   │                            │
│ Context Management      │   │ Process Management         │
│ Task Planning           │   │ Build / Run                │
│ Tool Selection          │   │ stdout / stderr            │
│ Code Generation         │   │ Logs                       │
│ Error Reasoning         │   │ Runtime State              │
│ Repair                  │   │                            │
└────────────┬────────────┘   └──────────────┬─────────────┘
             │                               │
             ▼                               ▼
      ┌──────────────┐              ┌──────────────────┐
      │ Model Layer  │              │ Generated Project│
      │              │              │                  │
      │ LLM Provider │              │ Frontend         │
      │ Local Models │              │ Backend          │
      └──────────────┘              │ Dependencies     │
                                    │ Configuration    │
                                    └──────────────────┘
```

---

# 🔬 AI Architecture

Webloom's intelligence layer can be viewed as several cooperating stages.

```text
┌──────────────────────┐
│      Requirement     │
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│   Context Builder    │
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│    Task Planner      │
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│    Agent / Tools     │
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│   Code Generation    │
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│      Executor        │
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│ Feedback / Errors     │
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│   Error Reasoning    │
└──────────┬───────────┘
           │
           └──────────────► Repair / Execute
```

---

# 📦 Context Management

Large projects can contain thousands of files and millions of tokens.

Sending the entire repository to an LLM for every request is inefficient.

Webloom can construct focused context from:

```text
User Requirement
      +
Project Structure
      +
Relevant Files
      +
Recent Changes
      +
Tool Results
      +
Build Output
      +
Runtime Logs
      +
Error Messages
```

The result is a context window containing the information most relevant to the current task.

---

# 🛡️ Security

AI-generated code introduces a fundamental security problem:

> **Generated code is untrusted code.**

A production deployment should isolate application execution from the host system.

Important controls include:

- 🔒 Process isolation
- 📁 Restricted filesystem access
- 🌐 Network restrictions
- ⏱️ Execution timeouts
- 💾 Memory limits
- 🧱 Resource limits
- 🔑 Environment-variable isolation
- 🚫 Command execution policies
- 👤 Project-level permissions

Generated applications should never receive unrestricted access to the host machine.

---

# 🧱 Technology

Webloom is designed as a modular system so individual layers can evolve independently.

| Layer | Responsibility |
|------|----------------|
| **Frontend** | Development interface |
| **Backend** | API and system orchestration |
| **AI / ML** | Reasoning and code generation |
| **Agent** | Tool selection and task execution |
| **Runtime** | Build and application execution |
| **Filesystem** | Project and file management |
| **Streaming** | Real-time execution updates |

The exact implementation stack may evolve as Webloom develops.

---

# 📁 Project Structure

```text
Webloom/
│
├── frontend/          # Web interface
├── backend/           # API and orchestration
├── ai/                # AI / agent logic
├── runtime/           # Application execution
│
├── package.json
├── .env.example
└── README.md
```

> The repository structure may change as the architecture evolves.

---

# 🚀 Getting Started

## Prerequisites

Make sure the development environment has the required runtime and package manager installed.

Typical requirements:

```text
Node.js
npm
Git
Configured LLM provider
```

---

## Clone

```bash
git clone <repository-url>
cd Webloom
```

## Install

```bash
npm install
```

## Environment

Create a `.env` file:

```env
PORT=5001
AI_API_KEY=your_api_key
```

Add the additional variables required by the configured services and model provider.

## Development

```bash
npm run dev
```

---

# 🧪 Example Workflow

### Input

```text
Create a project management application.

Users should be able to:
- Sign up and log in
- Create projects
- Create tasks
- Assign tasks
- Track progress
- View analytics
```

### Webloom

```text
Requirement
     ↓
Application Plan
     ↓
Project Structure
     ↓
Code Generation
     ↓
Dependency Installation
     ↓
Application Build
     ↓
Runtime Execution
     ↓
Error Detection
     ↓
AI Repair
     ↓
Verification
```

### Result

A functional application that can continue to be modified through natural language.

---

# 🗺️ Roadmap

- [x] Natural-language project generation
- [x] AI-assisted code generation
- [x] Project-aware context
- [x] Tool-based file operations
- [x] Runtime execution
- [x] Error feedback loop
- [x] Iterative code modification
- [ ] Improved autonomous planning
- [ ] Stronger project memory
- [ ] More robust sandboxing
- [ ] Automated testing and verification
- [ ] Multi-agent workflows
- [ ] Production-grade deployment
- [ ] Deeper codebase intelligence

---

# 🎯 Vision

Webloom aims to move software development from:

```text
Idea
  ↓
Human writes code
  ↓
Human runs code
  ↓
Human finds error
  ↓
Human debugs
  ↓
Human repeats
```

toward:

```text
Idea
  ↓
AI understands
  ↓
AI plans
  ↓
AI builds
  ↓
AI executes
  ↓
AI observes
  ↓
AI repairs
  ↓
Human reviews
```

The goal is not to remove developers.

The goal is to remove as much repetitive implementation and debugging overhead as possible, while keeping humans responsible for intent, architecture, constraints, and final decisions.

---

# 🌱 Why "Webloom"?

**Web + Bloom**

A web application starts as an idea and gradually takes shape through structure, code, execution, and iteration.

Webloom represents that process:

```text
Idea
  ↓
Structure
  ↓
Code
  ↓
Execution
  ↓
Iteration
  ↓
Application
```

---

# 📜 License

This project is currently under active development.

License information will be added as the project reaches its intended release stage.

---

<p align="center">
  <strong>Webloom</strong>
  <br>
  <sub>From intent to working software.</sub>
</p>

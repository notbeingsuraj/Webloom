# Webloom

> AI-native platform for building and developing web applications from natural language.

Webloom turns natural-language requirements into working web applications using LLMs, code generation, project context, tool execution, and automated debugging.

Instead of only generating code, Webloom follows an iterative development loop:

    Prompt
      ↓
    Understand
      ↓
    Plan
      ↓
    Generate / Modify
      ↓
    Execute
      ↓
    Inspect
      ↓
    Repair
      ↓
    Working Application

## What Webloom Does

- **Natural-language development** — describe what you want to build.
- **AI code generation** — generate and modify application code.
- **Project-aware reasoning** — understand the existing codebase and its structure.
- **Tool execution** — read files, edit code, install dependencies, run commands, and inspect logs.
- **Automated debugging** — use build and runtime errors as feedback for targeted fixes.
- **Live execution** — run generated applications and observe real execution results.
- **Iterative development** — continue developing an existing project through natural language.

## Architecture

    ┌──────────────────────────────┐
    │          Webloom UI          │
    │ Prompt • Editor • Preview    │
    │ Files • Logs • Controls      │
    └──────────────┬───────────────┘
                   │
                   ▼
    ┌──────────────────────────────┐
    │          API Server          │
    │ Projects • Sessions • AI     │
    │ Execution • Files • Events   │
    └──────────────┬───────────────┘
                   │
             ┌─────┴─────┐
             ▼           ▼
    ┌────────────────┐ ┌────────────────┐
    │   AI Layer     │ │ Runtime Engine │
    │                │ │                │
    │ LLMs           │ │ Build / Run    │
    │ Planning       │ │ Processes      │
    │ Reasoning      │ │ Logs / Errors  │
    │ Code Generation│ │                │
    └───────┬────────┘ └───────┬────────┘
            │                  │
            └─────────┬────────┘
                      ▼
               Generated Project

## AI Development Loop

Webloom is designed around a closed feedback loop rather than one-shot code generation.

    User Requirement
           ↓
    Context Construction
           ↓
    Task Planning
           ↓
    Tool Calls
           ↓
    Code Changes
           ↓
    Build / Runtime
           ↓
    Logs & Errors
           ↓
    Error Analysis
           ↓
    Targeted Repair
           └──────────────→ Build / Runtime

This allows Webloom to handle problems such as:

- Syntax and type errors
- Missing dependencies
- Broken imports
- Configuration issues
- Build failures
- Runtime exceptions
- Integration problems

## Core Components

### Frontend

The Webloom interface provides:

- Natural-language prompt input
- Project and file navigation
- Code editing
- Application preview
- Execution status
- Logs and errors
- AI interaction

### Backend

The backend coordinates the system and manages:

- API requests
- Projects and sessions
- AI orchestration
- File operations
- Process execution
- Runtime state
- Logs and errors

### AI Layer

The AI layer handles:

- Requirement understanding
- Task planning
- Code generation
- Code modification
- Project reasoning
- Error analysis
- Automated repair

### Runtime Engine

The runtime engine executes generated applications and provides real feedback to the AI.

Typical flow:

    Install dependencies
           ↓
    Start application
           ↓
    Capture output
           ↓
    Detect errors
           ↓
    Return feedback

## Tool-Based Development

Webloom gives the AI controlled tools for interacting with a project.

Typical operations include:

    read_file()
    write_file()
    edit_file()
    list_files()
    create_directory()
    install_dependency()
    run_command()
    inspect_logs()

This allows the AI to work with the project instead of simply producing isolated code snippets.

## Context Management

Webloom does not need to send the entire codebase to the model for every request.

Relevant context can include:

- User requirements
- Project structure
- Relevant source files
- Recent changes
- Tool results
- Build output
- Runtime logs
- Error messages

The goal is to provide the model with the right context while avoiding unnecessary data and token usage.

## Security

AI-generated code must be executed in an isolated environment.

Production deployments should consider:

- Process isolation
- Filesystem restrictions
- Resource limits
- Execution timeouts
- Network restrictions
- Environment-variable isolation
- Command policies
- Project-level permissions

Generated code should never be executed with unrestricted host privileges.

## Example

    Build a SaaS dashboard for managing projects.
    Add authentication, analytics, team management,
    and a responsive dark-mode interface.

Webloom interprets the requirement, plans the implementation, generates the code, runs the application, observes failures, and iterates on the project.

## Project Structure

    Webloom/
    ├── frontend/        # Web interface
    ├── backend/         # API and orchestration
    ├── runtime/         # Application execution
    ├── ai/              # AI / agent logic
    └── README.md

The actual structure may differ depending on the current implementation.

## Getting Started

### Clone

    git clone <repository-url>
    cd Webloom

### Install Dependencies

    npm install

### Configure Environment

Create a `.env` file containing the required configuration.

    PORT=5001
    AI_API_KEY=your_api_key

Add any additional variables required by the configured model provider or services.

### Run

    npm run dev

## Development Philosophy

Webloom is built around a simple principle:

> **Don't just generate code. Generate software that works.**

The system therefore focuses on the complete development cycle:

    Generate
       ↓
    Execute
       ↓
    Observe
       ↓
    Debug
       ↓
    Repair
       ↓
    Verify

## Status

Webloom is an actively developed project focused on AI-assisted software engineering, autonomous code generation, application execution, and iterative debugging.

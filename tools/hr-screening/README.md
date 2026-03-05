# 🛠 Claude Tools

A personal repository of AI-powered tools built with [Claude](https://claude.ai) and the Anthropic API.

Each tool lives in its own folder under `/tools` and is a self-contained React component that can be run directly inside Claude's artifact viewer or dropped into any React project.

---

## 📦 Tools

| Tool | Description | Status |
|------|-------------|--------|
| [HR Screening](./tools/hr-screening) | AI-powered candidate screening — upload a job description and PDF resumes, get ranked candidates with scores, strengths, concerns, and hiring recommendations | ✅ Active |

---

## 🚀 How to use a tool

### Option A — Run in Claude (easiest)
1. Open [claude.ai](https://claude.ai)
2. Start a new conversation
3. Paste the contents of the tool's `App.jsx` into the message
4. Ask Claude to *"render this as an artifact"*

### Option B — Run locally in a React project
```bash
# 1. Create a new Vite + React project
npm create vite@latest my-tools -- --template react
cd my-tools && npm install

# 2. Copy the tool's App.jsx into src/
cp tools/hr-screening/App.jsx src/App.jsx

# 3. Start the dev server
npm run dev
```

> **Note:** Tools call the Anthropic API directly from the browser. You'll need to configure your API key — see each tool's README for details.

---

## 🗂 Repository structure

```
claude-tools/
├── README.md               ← You are here
└── tools/
    └── hr-screening/
        ├── README.md       ← Tool-specific docs
        └── App.jsx         ← The tool (single self-contained file)
```

New tools are added to `/tools` as they're built. Each gets its own folder and README.

---

## 📋 Adding a new tool

1. Create a new folder: `tools/<tool-name>/`
2. Save the `.jsx` file from Claude as `App.jsx`
3. Add a `README.md` using the template in any existing tool folder
4. Update the **Tools** table in this README

---

*Built with [Claude](https://claude.ai) by Anthropic*

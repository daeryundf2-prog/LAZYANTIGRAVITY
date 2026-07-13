---
slug: hooks
section: Antigravity 2.0
title: Hooks
path:
  - Antigravity 2.0
  - Customizations
  - Hooks
---

# Hooks

Hooks allow you to run custom scripts or shell commands at specific points during Antigravity's execution loop. This is powerful for enforcing custom rules, running linters, or capturing diagnostics automatically.

## Configuration

Hooks are configured in a `hooks.json` file located in your customization directory (e.g., `.agents/` in your workspace or `~/.gemini/config/`).

## Schema and File Format

The `hooks.json` file maps hook names to their event configurations.

```json
{
  "my-linter-hook": {
    "PostToolUse": [
      {
        "matcher": "run_command",
        "hooks": [
          {
            "type": "command",
            "command": "./scripts/lint.sh",
            "timeout": 10
          }
        ]
      }
    ]
  },
  "safety-gate": {
    "enabled": false,
    "PreToolUse": [
      {
        "matcher": "run_command",
        "hooks": [
          {
            "command": "./scripts/safety-check.sh"
          }
        ]
      }
    ]
  },
  "reminder": {
    "PreInvocation": [
      {
        "type": "command",
        "command": "./scripts/reminder.sh"
      }
    ]
  }
}
```

### Hook Definition Fields

| Field | Type | Description |
| :--- | :--- | :--- |
| `enabled` | boolean | Optional. Set to `false` to disable the hook without removing it. Defaults to `true`. |
| `PreToolUse` | array | Handlers that run before a tool is executed. |
| `PostToolUse` | array | Handlers that run after a tool completes. |
| `PreInvocation` | array | Handlers that run before Antigravity calls the model. |
| `PostInvocation` | array | Handlers that run after tool calls finish. |
| `Stop` | array | Handlers that run when the execution loop terminates. |

## Supported Events

| Event | Description | Matcher Target |
| :--- | :--- | :--- |
| `PreToolUse` | Fires before a tool is executed. | Tool name (e.g., `run_command`) |
| `PostToolUse` | Fires after a tool completes. | Tool name |
| `PreInvocation` | Fires before the model is called. | N/A (matcher ignored) |
| `PostInvocation` | Fires after tool calls finish. | N/A (matcher ignored) |
| `Stop` | Fires when execution terminates. | N/A (matcher ignored) |

### Matcher

For `PreToolUse` and `PostToolUse`, you can use a regular expression in the `matcher` field to specify which tools trigger the hook:

* `""` or `"*"`: Match all tools.
* `"run_command"`: Match exactly `run_command`.
* `"run_command|view_file"`: Match either tool.
* `"browser_.*"`: Match any tool starting with `browser_`.

<Announcement>
icon: info
iconColor: var(--theme-primary)
color: var(--theme-surface-surface-container)
text: **Note**: For `PreInvocation`, `PostInvocation`, and `Stop`, the structure is simpler (a list of handlers directly under the event key) and the matcher is ignored.
</Announcement>

## Supported Tools

For `PreToolUse` and `PostToolUse` matchers, you can match against the following tool names, grouped by category:

### File and Directory Operations

* **`view_file`**: View the contents of a file.
  * Arguments: `AbsolutePath`, `StartLine` (optional), `EndLine` (optional), `IsSkillFile` (optional)
* **`write_to_file`**: Create new files.
  * Arguments: `TargetFile`, `Overwrite`, `CodeContent`, `Description`, `IsArtifact` (optional), `ArtifactMetadata` (optional)
* **`replace_file_content`**: Edit a single contiguous block of text in a file.
  * Arguments: `TargetFile`, `Instruction`, `Description`, `AllowMultiple`, `TargetContent`, `ReplacementContent`, `StartLine`, `EndLine`, `TargetLintErrorIds` (optional)
* **`multi_replace_file_content`**: Make multiple, non-contiguous edits to the same file.
  * Arguments: `TargetFile`, `Instruction`, `Description`, `ReplacementChunks` (array of chunks), `TargetLintErrorIds` (optional), `ArtifactMetadata` (optional)
* **`list_dir`**: List the contents of a directory.
  * Arguments: `DirectoryPath`
* **`find_by_name`**: Search for files and directories using glob patterns.
  * Arguments: `SearchDirectory`, `Pattern`, `Type` (optional), `Excludes` (optional), `Extensions` (optional), `FullPath` (optional), `MaxDepth` (optional)

### Search and Research

* **`grep_search`**: Fast text searches within specific paths.
  * Arguments: `SearchPath`, `Query`, `IsRegex` (optional), `CaseInsensitive` (optional), `Includes` (optional), `MatchPerLine` (optional)
* **`search_web`**: Perform a general web search.
  * Arguments: `query`, `domain` (optional)
* **`read_url_content`**: Fetch text content of a public URL.
  * Arguments: `Url`

### System and Execution

* **`run_command`**: Propose a bash command to run.
  * Arguments: `CommandLine`, `Cwd`, `WaitMsBeforeAsync`, `RunPersistent` (optional), `RequestedTerminalID` (optional)
* **`manage_task`**: Interact with background tasks.
  * Arguments: `Action` (`'list'`, `'kill'`, `'status'`, `'send_input'`), `TaskId` (optional), `Input` (optional)
* **`schedule`**: Set timers or recurring cron jobs.
  * Arguments: `DurationSeconds` (optional), `CronExpression` (optional), `MaxIterations` (optional), `Prompt`
* **`list_permissions`**: View current resource access grants.
  * Arguments: None
* **`ask_permission`**: Request additional scoped permissions.
  * Arguments: `Action`, `Target`, `Reason`

### Agent Collaboration

* **`invoke_subagent`**: Spawn specialized sub-agents.
  * Arguments: `Subagents` (array of specs with `Prompt`, `Role`, `TypeName`, `Workspace` (optional))
* **`define_subagent`**: Create a custom sub-agent.
  * Arguments: `name`, `description`, `system_prompt`, `enable_mcp_tools` (optional), `enable_write_tools` (optional), `enable_subagent_tools` (optional)
* **`send_message`**: Communicate with other agents.
  * Arguments: `Recipient`, `Message`
* **`manage_subagents`**: List or terminate active sub-agents.
  * Arguments: `Action` (`'list'`, `'kill'`, `'kill_all'`), `ConversationIds` (optional)

### Interaction and Media

* **`ask_question`**: Ask multiple-choice questions.
  * Arguments: `questions` (array of questions with `question`, `options`, `is_multi_select`)
* **`generate_image`**: Create or edit images.
  * Arguments: `Prompt`, `ImageName`, `ImagePaths` (optional)

## Hook Handler Configuration

Each item in the `hooks` array supports:

| Field | Type | Description |
| :--- | :--- | :--- |
| `type` | string | Optional. Currently only `"command"` is supported. Defaults to `"command"`. |
| `command` | string | Required. The shell command to execute. |
| `timeout` | integer | Optional. Timeout in seconds. Defaults to `30`. |

## Input/Output Contract

Hooks receive input via **stdin** as JSON and should return output via **stdout** as JSON. Field names use camelCase.

### Common Input Fields

All hooks receive the following system metadata fields in their input payload on `stdin`:

| Field | Type | Description |
| :--- | :--- | :--- |
| `conversationId` | string | The unique UUID of the active agent conversation. |
| `workspacePaths` | array of strings | Absolute directory paths representing the user's mounted workspaces. |
| `transcriptPath` | string | The absolute path to the persistent `transcript.jsonl` conversation logs. <br>**Note**: This file lives in: `<app_data_dir>/brain/<conversationId>/.system_generated/logs/transcript.jsonl` where `<app_data_dir>` is:<ul><li>`~/.gemini/antigravity` for Antigravity 2.0</li><li>`~/.gemini/antigravity-cli` for CLI</li></ul> |
| `artifactDirectoryPath` | string | The absolute path to the directory containing all conversation artifacts and screenshots. |

---

### PreToolUse

Fires before a tool is executed.

**Schema**

**Input Fields (stdin)**:

| Field | Type | Description |
| :--- | :--- | :--- |
| `toolCall` | object | Details of the proposed tool call. |
| `toolCall.name` | string | The name of the tool being executed (e.g., `run_command`). |
| `toolCall.args` | object | The arguments passed to the tool. |
| `stepIdx` | integer | The 0-based index of the current step in the trajectory. |
| *(Common Fields)* | | Includes `conversationId`, `workspacePaths`, `transcriptPath`, `artifactDirectoryPath`. |

**Output Fields (stdout)**:

| Field | Type | Description |
| :--- | :--- | :--- |
| `decision` | string | **Required.** Controls how the tool call is gated:<br>- `"allow"`: Automatically allows the tool execution.<br>- `"deny"`: Hard blocks execution immediately.<br>- `"ask"`: Prompts the user, but respects "Always Allow" settings.<br>- `"force_ask"`: Always prompts the user, ignoring cached permissions. |
| `reason` | string | **Optional.** The explanation shown to the agent or user for the decision. |
| `permissionOverrides` | array of strings | **Optional.** A list of resource strings (e.g. `["read_file(/path)", "command(args)"]`) to override default tool permissions. |

**Example**

* **Input (stdin)**:

```json
{
  "toolCall": {
    "name": "run_command",
    "args": {
      "CommandLine": "npm test",
      "Cwd": "/workspace/project",
      "WaitMsBeforeAsync": 5000
    }
  },
  "stepIdx": 19,
  "conversationId": "ec33ebf9-0cba-4100-8142-c61503f6c587",
  "workspacePaths": ["/workspace/project"],
  "transcriptPath": "~/.gemini/antigravity/brain/ec33ebf9-0cba-4100-8142-c61503f6c587/.system_generated/logs/transcript.jsonl",
  "artifactDirectoryPath": "~/.gemini/antigravity/brain/ec33ebf9-0cba-4100-8142-c61503f6c587"
}
```

* **Output (stdout)**:

```json
{
  "decision": "ask",
  "reason": "Requires confirmation for test execution.",
  "permissionOverrides": ["command(npm test)"]
}
```

---

### PostToolUse

Fires after a tool completes.

**Schema**

**Input Fields (stdin)**:

| Field | Type | Description |
| :--- | :--- | :--- |
| `stepIdx` | integer | The 0-based index of the completed step. |
| `error` | string | Optional. The detailed runtime error message if the tool call failed. Empty if successful. |
| *(Common Fields)* | | Includes `conversationId`, `workspacePaths`, `transcriptPath`, `artifactDirectoryPath`. |

**Output Fields (stdout)**: Returns an empty JSON object `{}`.

**Example**

* **Input (stdin)**:

```json
{
  "stepIdx": 5,
  "error": "exit status 1",
  "conversationId": "ec33ebf9-0cba-4100-8142-c61503f6c587",
  "workspacePaths": ["/workspace/project"],
  "transcriptPath": "~/.gemini/antigravity/brain/ec33ebf9-0cba-4100-8142-c61503f6c587/.system_generated/logs/transcript.jsonl",
  "artifactDirectoryPath": "~/.gemini/antigravity/brain/ec33ebf9-0cba-4100-8142-c61503f6c587"
}
```

* **Output (stdout)**: `{}`

---

### PreInvocation

Fires before the model is called.

**Schema**

**Input Fields (stdin)**:

| Field | Type | Description |
| :--- | :--- | :--- |
| `invocationNum` | integer | The 0-indexed sequence number of the current model invocation (the first invocation is 0). |
| `initialNumSteps` | integer | The number of steps currently in the trajectory. |
| *(Common Fields)* | | Includes `conversationId`, `workspacePaths`, `transcriptPath`, `artifactDirectoryPath`. |

**Output Fields (stdout)**:

| Field | Type | Description |
| :--- | :--- | :--- |
| `injectSteps` | array of objects | **Optional.** List of steps to inject into the conversation trajectory before the model is called. |

*Injected Step Schema*: Each object in the `injectSteps` array can have one of the following fields:

* `toolCall` (object): A tool call to execute.
* `userMessage` (string): A message from the user.
* `ephemeralMessage` (string): A transient system message.

**Example**

* **Input (stdin)**:

```json
{
  "invocationNum": 3,
  "initialNumSteps": 10,
  "conversationId": "ec33ebf9-0cba-4100-8142-c61503f6c587",
  "workspacePaths": ["/workspace/project"],
  "transcriptPath": "~/.gemini/antigravity/brain/ec33ebf9-0cba-4100-8142-c61503f6c587/.system_generated/logs/transcript.jsonl",
  "artifactDirectoryPath": "~/.gemini/antigravity/brain/ec33ebf9-0cba-4100-8142-c61503f6c587"
}
```

* **Output (stdout)**:

```json
{
  "injectSteps": [{"ephemeralMessage": "Remember to lint"}]
}
```

---

### PostInvocation

Fires after tool calls finish.

**Schema**

**Input Fields (stdin)**: Same as `PreInvocation` input fields.

**Output Fields (stdout)**:

| Field | Type | Description |
| :--- | :--- | :--- |
| `injectSteps` | array of objects | **Optional.** List of steps to inject after the invocation completes (same schema as `PreInvocation` inject steps). |
| `terminationBehavior` | string | **Optional.** Controls the execution flow after injection:<br>- `"force_continue"`: Forces the loop to continue.<br>- `"terminate"`: Forces the loop to terminate.<br>- `""` (or omitted): Default behavior. |

**Example**

* **Input (stdin)**: Same as `PreInvocation`
* **Output (stdout)**:

```json
{
  "injectSteps": [],
  "terminationBehavior": ""
}
```

---

### Stop

Fires when the execution loop terminates.

**Schema**

**Input Fields (stdin)**:

| Field | Type | Description |
| :--- | :--- | :--- |
| `executionNum` | integer | The sequence number of the execution attempt. |
| `terminationReason` | string | The reason why the execution is stopping (e.g., `"model_stop"`, `"max_steps_exceeded"`, `"error"`). |
| `error` | string | Optional. The error message if termination was caused by a system error. |
| `fullyIdle` | boolean | **Required.** `true` if the agent is completely finished and all background commands or asynchronous tasks have completed. `false` if active background tasks are still running. |
| *(Common Fields)* | | Includes `conversationId`, `workspacePaths`, `transcriptPath`, `artifactDirectoryPath`. |

**Output Fields (stdout)**:

| Field | Type | Description |
| :--- | :--- | :--- |
| `decision` | string | **Required.** Set to `"continue"` to prevent the agent from stopping and re-enter the execution loop. Any other value allows the stop. |
| `reason` | string | **Optional.** If `decision` is `"continue"`, this message is injected as a system message into the conversation. |

**Example**

* **Input (stdin)**:

```json
{
  "executionNum": 1,
  "terminationReason": "model_stop",
  "error": "",
  "fullyIdle": true,
  "conversationId": "ec33ebf9-0cba-4100-8142-c61503f6c587",
  "workspacePaths": ["/workspace/project"],
  "transcriptPath": "~/.gemini/antigravity/brain/ec33ebf9-0cba-4100-8142-c61503f6c587/.system_generated/logs/transcript.jsonl",
  "artifactDirectoryPath": "~/.gemini/antigravity/brain/ec33ebf9-0cba-4100-8142-c61503f6c587"
}
```

* **Output (stdout)**:

```json
{
  "decision": "continue",
  "reason": "Not done yet"
}
```

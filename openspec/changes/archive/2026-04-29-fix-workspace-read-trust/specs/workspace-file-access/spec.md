## ADDED Requirements

### Requirement: ACP agents can discover workspace read capability
The system SHALL advertise ACP client filesystem read capability when initializing a compatible agent runtime.

#### Scenario: Runtime initializes with filesystem read support
- **WHEN** the backend initializes an ACP agent runtime
- **THEN** the initialize request SHALL include client capability metadata indicating that the client can read text files
- **AND** the backend SHALL continue to omit client filesystem write capability unless write support is explicitly implemented

### Requirement: Workspace text files are readable without approval
The system SHALL allow a live ACP session's agent to read text files whose canonical path is inside that session's workspace root without creating a permission request.

#### Scenario: Agent reads a text file inside the session workspace
- **WHEN** an ACP agent sends a read text file request for a path whose canonical target is inside the workspace root for the request's session
- **THEN** the backend SHALL return the requested text content to the agent
- **AND** it SHALL NOT persist a permission request
- **AND** it SHALL NOT change the local session status to `waiting_approval`

#### Scenario: Agent reads a workspace file with line bounds
- **WHEN** an ACP agent sends a read text file request with line or limit parameters for a file inside the session workspace
- **THEN** the backend SHALL return only the requested text range according to the ACP read request semantics
- **AND** it SHALL NOT create an approval prompt for that read

### Requirement: Workspace read requests are bounded to the trusted root
The system SHALL reject ACP read text file requests that do not resolve to a canonical path inside the owning session's workspace root.

#### Scenario: Agent requests a path outside the workspace
- **WHEN** an ACP agent sends a read text file request for a path whose canonical target is outside the session workspace root
- **THEN** the backend SHALL return a structured read error to the agent
- **AND** it SHALL NOT create a permission request for the outside path

#### Scenario: Agent requests a symlink escape
- **WHEN** an ACP agent sends a read text file request for a workspace path that canonicalizes through a symlink to a location outside the workspace root
- **THEN** the backend SHALL reject the read as outside the trusted workspace boundary
- **AND** it SHALL NOT return the external file content

#### Scenario: Agent requests a file for an unknown ACP session
- **WHEN** an ACP agent sends a read text file request with a session id that cannot be mapped to a local session and workspace
- **THEN** the backend SHALL return a structured read error to the agent
- **AND** it SHALL NOT read from the local filesystem

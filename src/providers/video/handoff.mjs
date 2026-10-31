// Handoff: for video tools without an API (Google Flow and similar). briefcut writes the scene
// prompts (flow_brief.md); a person, or a browser agent they supervise in their own logged-in
// session, generates and downloads the takes; `briefcut ingest` copies them into clips/_takes.
// briefcut ships no code that drives a consumer web app. See playbooks/flow-browser-agent.md.
export class HandoffProvider {
  constructor() {
    this.name = 'handoff';
    this.billing = 'whatever the video tool charges (credits in your own account)';
    this.docs = 'playbooks/flow-browser-agent.md';
  }

  async submit({ scene }) {
    return { id: `handoff-${scene}`, scene, handoff: true };
  }

  async poll() {
    return { status: 'handoff' };
  }

  async download() {
    throw new Error('handoff: there is nothing to download from briefcut; generate the takes in your video tool, then run `briefcut ingest <dir> --from <downloads>`');
  }

  async estimate() {
    return null;
  }
}

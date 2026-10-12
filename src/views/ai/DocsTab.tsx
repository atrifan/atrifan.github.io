'use client';

import { useControlPanelData } from './useControlPanelData';
import { PageHeading, Section } from './ui';
import s from './ai.module.css';

const DMG = 'https://s07musqc7iej8klq.public.blob.vercel-storage.com/HoriaAssistant-0.1.1';

export function DocsTab() {
  const { showDownloads } = useControlPanelData();
  return (
    <>
      <PageHeading lede="How to set up the Tex assistant and what it can do.">Docs</PageHeading>
      <div className={s.docs}>
        <Section title="Getting started">
          <p>
            Tex is a personal AI assistant that lives in your browser, your terminal and Telegram. It sees what you see, works web pages for you,
            runs shell commands, calls APIs and learns your preferences. All three channels share the same headless browser, skills and memory.
          </p>
          <ul>
            <li>
              <strong>Chrome side panel:</strong> interactive work on the current tab.
            </li>
            <li>
              <strong>Telegram bot:</strong> tasks while you are away, schedules and quick questions.
            </li>
            <li>
              <strong>CLI:</strong> scripting and automation from other tools.
            </li>
          </ul>
        </Section>

        <Section title="Installation">
          {showDownloads ? (
            <div className={s.formActions}>
              <a className={`${s.btn} ${s.btn_primary}`} href={`${DMG}-arm64.dmg`}>
                Download for Apple Silicon
              </a>
              <a className={s.btn} href={`${DMG}-x64.dmg`}>
                Download for Intel Macs
              </a>
            </div>
          ) : null}
          <details>
            <summary>Chrome extension</summary>
            <ol>
              <li>Download the extension from the releases page.</li>
              <li>
                Open <code>chrome://extensions</code> and turn on Developer mode.
              </li>
              <li>
                Choose Load unpacked and select the <code>plugin/dist</code> folder.
              </li>
              <li>Open this page: the extension pairs with your Tulzo account.</li>
            </ol>
          </details>
          <details>
            <summary>Native host (CLI)</summary>
            <pre>{`git clone https://github.com/user/assistant-plugin.git
cd assistant-plugin
node bin/cli.js setup
node bin/cli.js start   # opens Tulzo sign-in on first run`}</pre>
          </details>
          <details>
            <summary>Model credentials</summary>
            <p>Open the panel, choose the gear icon, paste your API key, pick a model and save. For AWS Bedrock use the access key and a Bedrock model id.</p>
          </details>
          <details>
            <summary>Tulzo sign-in</summary>
            <p>On first start the native host opens Tulzo&apos;s sign-in page. After you sign in, a token confirming your plan is saved on the device.</p>
          </details>
        </Section>

        <Section title="Using the panel">
          <details>
            <summary>Messages and context</summary>
            <p>Type and press Enter. The assistant sees your message and the page (address, title, key elements). Drop files onto the input to attach them.</p>
          </details>
          <details>
            <summary>Slash commands</summary>
            <ul>
              <li>
                <code>/background &lt;task&gt;</code> runs a task in the headless browser without blocking the panel.
              </li>
              <li>
                <code>/schedule &lt;time&gt; &lt;when&gt; &lt;task&gt;</code> creates a schedule; <code>/schedule list</code> lists them.
              </li>
              <li>
                <code>/stop</code> stops the running task; <code>/help</code> lists commands.
              </li>
            </ul>
          </details>
        </Section>

        <Section title="Telegram">
          <details>
            <summary>Setup</summary>
            <ol>
              <li>Create a bot with @BotFather and keep the token.</li>
              <li>Send the bot a message, then read your chat id from the bot API&apos;s getUpdates.</li>
              <li>Enable the Telegram channel skill and set its secrets, then restart the native host.</li>
            </ol>
          </details>
          <details>
            <summary>Escalation</summary>
            <p>If the assistant asks a question in the panel and you don&apos;t answer within five minutes, it asks again on Telegram. Reply there and the task continues.</p>
          </details>
        </Section>

        <Section title="Skills, MCP servers and schedules">
          <p>
            <strong>Skills</strong> give the assistant site- or domain-specific abilities (a <code>SKILL.md</code> plus optional code). Manage them under
            Packages.
          </p>
          <p>
            <strong>MCP servers</strong> expose APIs as tools (GitHub, mail, databases). Tools are named <code>mcp__server__tool</code>. Manage them under MCP
            servers.
          </p>
          <p>
            <strong>Schedules</strong> run a prompt on a cron (for example <code>0 9 * * 1-5</code> for 09:00 on weekdays). Manage them under Schedules.
          </p>
        </Section>

        <Section title="Shell and files">
          <p>
            The assistant reads and writes files natively and runs shell commands in a persistent session per conversation (<code>cd</code> and{' '}
            <code>export</code> carry over). The native host also listens on a local socket so other tools can drive its headless browser.
          </p>
        </Section>
      </div>
    </>
  );
}

import { getRPSChoices } from "./game.js";
import { capitalize, DiscordRequest } from "./utils.js";

export async function HasGuildCommands(appId, guildId, commands) {
  if (guildId === "" || appId === "") return;

  commands.forEach((c) => HasGuildCommand(appId, guildId, c));
}

// Checks for a command
async function HasGuildCommand(appId, guildId, command) {
  // API endpoint to get and post guild commands
  const endpoint = `applications/${appId}/guilds/${guildId}/commands`;

  try {
    const res = await DiscordRequest(endpoint, { method: "GET" });
    const data = await res.json();

    if (data) {
      const installedNames = data.map((c) => c["name"]);
      // This is just matching on the name, so it's not good for updates
      if (!installedNames.includes(command["name"])) {
        console.log(`Installing "${command["name"]}"`);
        InstallGuildCommand(appId, guildId, command);
      } else {
        console.log(`"${command["name"]}" command already installed`);
      }
    }
  } catch (err) {
    console.error(err);
  }
}

// Installs a command
export async function InstallGuildCommand(appId, guildId, command) {
  // API endpoint to get and post guild commands
  const endpoint = `applications/${appId}/guilds/${guildId}/commands`;
  // install command
  try {
    await DiscordRequest(endpoint, { method: "POST", body: command });
  } catch (err) {
    console.error(err);
  }
}

// Set server icon
export async function SetServerIcon(guildId, icon) {
  // API endpoint to get and patch the guild
  const endpoint = `guilds/${guildId}`;
  // Set server icon
  try {
    await DiscordRequest(endpoint, { method: "PATCH", body: icon });
  } catch (err) {
    console.error(err);
  }
}

// Get the game choices from game.js
function createCommandChoices() {
  const choices = getRPSChoices();
  const commandChoices = [];

  for (let choice of choices) {
    commandChoices.push({
      name: capitalize(choice),
      value: choice.toLowerCase(),
    });
  }

  return commandChoices;
}

// Simple test command
export const TEST_COMMAND = {
  name: "test",
  description: "Basic guild command",
  type: 1,
};

// Command containing options
export const CHALLENGE_COMMAND = {
  name: "challenge",
  description: "Challenge to a match of rock paper scissors",
  options: [
    {
      type: 3, // string
      name: "object",
      description: "Pick your object",
      required: true,
      choices: createCommandChoices(),
    },
  ],
  type: 1,
};

// Command containing options
export const CHANNEL_UNSUBSCRIBE_COMMAND = {
  name: "unsubscribe",
  description: "Unsubscribe from a channel",
  options: [
    {
      type: 7, // channel
      name: "channel",
      description: "Pick your channel",
      required: true,
    },
  ],
  type: 1,
};

export const SERVER_ICON_COMMAND = {
  name: "Set as server icon",
  description: "",
  type: 3,
};

import "dotenv/config";
import express from "express";
import {
  InteractionType,
  InteractionResponseType,
  InteractionResponseFlags,
  MessageComponentTypes,
  ButtonStyleTypes
} from "discord-interactions";
import DiscordInteractions from "discord-interactions";
import imageToBase64 from "image-to-base64";
import {
  VerifyDiscordRequest,
  getRandomEmoji,
  DiscordRequest,
  base64EncodeImage,
} from "./utils.js";
import { getShuffledOptions, getResult } from "./game.js";
import {
  CHALLENGE_COMMAND,
  TEST_COMMAND,
  CHANNEL_UNSUBSCRIBE_COMMAND,
  SERVER_ICON_COMMAND,
  HasGuildCommands,
} from "./commands.js";

import https from "https";
import fs from "fs";

// Create an express app
const app = express();
// Get port, or default to 3000
const PORT = process.env.PORT || 3000;
const PUBLIC_KEY = process.env.PUBLIC_KEY;

// Parse request body and verifies incoming requests using discord-interactions package
app.use(express.json({ verify: VerifyDiscordRequest(PUBLIC_KEY) }));

// Store for in-progress games. In production, you'd want to use a DB
const activeGames = {};

/**
 * Interactions endpoint URL where Discord will send HTTP requests
 */
 app.post('/interactions', async function (req, res) {
  // Interaction type and data
  const { type, id, data } = req.body;
  // const signature = req.get('X-Signature-Ed25519');
  // const timestamp = req.get('X-Signature-Timestamp');
  // const isValidRequest = verifyKey(req.rawBody, signature, timestamp, 'PUBLIC_KEY');
  // if (!isValidRequest) {
  //   return res.status(401).end('Bad request signature');
  // }

  /**
   * Handle verification requests
   */
  if (type === InteractionType.PING) {
    console.log(req, res);
    return res.send({ type: InteractionResponseType.PONG });
  }

  /**
   * Handle slash command requests
   * See https://discord.com/developers/docs/interactions/application-commands#slash-commands
   */
  if (type === InteractionType.APPLICATION_COMMAND) {
    const { name } = data;

    // "test" guild command
    if (name === "test") {
      // Send a message into the channel where command was triggered from
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          // Fetches a random emoji to send from a helper function
          content: "hello world " + getRandomEmoji(),
        },
      });
    }

    // "challenge" guild command
    if (name === "challenge" && id) {
      const userId = req.body.member.user.id;
      // User's object choice
      const objectName = req.body.data.options[0].value;

      // Create active game using message ID as the game ID
      activeGames[id] = {
        id: userId,
        objectName,
      };

      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          // Fetches a random emoji to send from a helper function
          content: `Rock papers scissors challenge from <@${userId}>`,
          components: [
            {
              type: MessageComponentTypes.ACTION_ROW,
              components: [
                {
                  type: MessageComponentTypes.BUTTON,
                  // Append the game ID to use later on
                  custom_id: `accept_button_${req.body.id}`,
                  label: "Accept",
                  style: ButtonStyleTypes.PRIMARY,
                },
              ],
            },
          ],
        },
      });
    }

    if (name === "unsubscribe" && id) {
      const userId = req.body.member.user.id;
      const channel = req.body.data.options[0].value;

      console.log(userId);
      console.log(channel);
    }

    if (name === "Set as server icon") {
      const message = data.resolved.messages[data.target_id];
      const imageUrl = message.attachments[0]?.url ?? message.embeds[0]?.url;
      // if (!imageUrl)    TODO
      const extension = imageUrl.split(".").pop();

      // API endpoint to get and patch the guild
      const endpoint = "guilds/" + process.env.GUILD_ID;

      imageToBase64(imageUrl)
        .then((response) => {
          // "cGF0aC90by9maWxlLmpwZw=="
          const payload = {
            icon: `data:image/${extension};base64,${response}`,
          };

          try {
            DiscordRequest(endpoint, { method: "PATCH", body: payload });
          } catch (err) {
            console.error(err);
          }
        })
        .catch((error) => {
          console.log(error); // Logs an error if there was one
        });

      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          // Fetches a random emoji to send from a helper function
          content: `Set the new server icon to ${imageUrl}`,
        },
      });
    }

    DiscordInteractions.handleInteraction(req.body)
    .then((result) => {
      // Handle the interaction result here
      res.json(result);
    })
    .catch((err) => {
      console.error(err);
      res.status(500).json({ error: 'An error occurred while handling the interaction' });
    });
  }

  /**
   * Handle requests from interactive components
   * See https://discord.com/developers/docs/interactions/message-components#responding-to-a-component-interaction
   */
  if (type === InteractionType.MESSAGE_COMPONENT) {
    // custom_id set in payload when sending message component
    const componentId = data.custom_id;

    if (componentId.startsWith("accept_button_")) {
      // get the associated game ID
      const gameId = componentId.replace("accept_button_", "");
      // Delete message with token in request body
      const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/${req.body.message.id}`;
      try {
        await res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            // Fetches a random emoji to send from a helper function
            content: "What is your object of choice?",
            // Indicates it'll be an ephemeral message
            flags: InteractionResponseFlags.EPHEMERAL,
            components: [
              {
                type: MessageComponentTypes.ACTION_ROW,
                components: [
                  {
                    type: MessageComponentTypes.STRING_SELECT,
                    // Append game ID
                    custom_id: `select_choice_${gameId}`,
                    options: getShuffledOptions(),
                  },
                ],
              },
            ],
          },
        });
        // Delete previous message
        await DiscordRequest(endpoint, { method: "DELETE" });
      } catch (err) {
        console.error("Error sending message:", err);
      }
    } else if (componentId.startsWith("select_choice_")) {
      // get the associated game ID
      const gameId = componentId.replace("select_choice_", "");

      if (activeGames[gameId]) {
        // Get user ID and object choice for responding user
        const userId = req.body.member.user.id;
        const objectName = data.values[0];
        // Calculate result from helper function
        const resultStr = getResult(activeGames[gameId], {
          id: userId,
          objectName,
        });

        // Remove game from storage
        delete activeGames[gameId];
        // Update message with token in request body
        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/${req.body.message.id}`;

        try {
          // Send results
          await res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: { content: resultStr },
          });
          // Update ephemeral message
          await DiscordRequest(endpoint, {
            method: "PATCH",
            body: {
              content: "Nice choice " + getRandomEmoji(),
              components: [],
            },
          });
        } catch (err) {
          console.error("Error sending message:", err);
        }
      }
    }
  }
});

const privateKey = fs.readFileSync('/etc/letsencrypt/live/weirdvibes.hopto.org/privkey.pem', 'utf8');
const certificate = fs.readFileSync('/etc/letsencrypt/live/weirdvibes.hopto.org/cert.pem', 'utf8');
const ca = fs.readFileSync('/etc/letsencrypt/live/weirdvibes.hopto.org/chain.pem', 'utf8');

const credentials = {
  key: privateKey,
  cert: certificate,
  ca: ca
};

https
  .createServer(credentials, app)
  .listen(PORT, () => {
    console.log("HTTPS Server listening on port", PORT)

    // Check if guild commands from commands.json are installed (if not, install them)
    HasGuildCommands(process.env.APP_ID, process.env.GUILD_ID, [
      TEST_COMMAND,
      CHALLENGE_COMMAND,
      CHANNEL_UNSUBSCRIBE_COMMAND,
      SERVER_ICON_COMMAND,
    ]);
  });

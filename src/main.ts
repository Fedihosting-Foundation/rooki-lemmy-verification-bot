import "reflect-metadata";
import { importx } from "@discordx/importer";
import { IntentsBitField, Interaction, Message } from "discord.js";
import { Client, DIService, typeDiDependencyRegistryEngine } from "discordx";
import dotenv from "dotenv";
dotenv.config();
import { LemmyHttp } from "lemmy-js-client";
import Container, { Service } from "typedi";
import connection from "./connection";
import { instanceUrl } from "./helpers/lemmyHelper";
import { startServer } from "./server/api";
import verifiedUserService from "./services/verifiedUserService";
DIService.engine = typeDiDependencyRegistryEngine
  .setService(Service)
  .setInjector(Container);

process.on("uncaughtException", (error) => {
  console.log("uncaught error:");
  console.log(error);

  setTimeout(() => {
    process.exit(1);
  }, 5000);
});

export const extended_guilds: string[] = [
  "932286006156222495",
  "1128644575276318801",
];

export const bot = new Client({
  // To use only guild command
  // botGuilds: [(client) => client.guilds.cache.map((guild) => guild.id)],

  // Discord intents
  intents: [IntentsBitField.Flags.Guilds, IntentsBitField.Flags.GuildMembers],

  // Debug logs are disabled in silent mode
  silent: false,

  // Configuration for @SimpleCommand
  simpleCommand: {
    prefix: "!",
  },
});

bot.once("ready", async () => {
  // Make sure all guilds are cached
  await bot.guilds.fetch();

  // Synchronize applications commands with Discord
  await bot.initApplicationCommands();

  // To clear all guild commands, uncomment this line,
  // This is useful when moving from guild commands to global commands
  // It must only be executed once
  //
  //  await bot.clearApplicationCommands(
  //    ...bot.guilds.cache.map((g) => g.id)
  //  );

  console.log("Bot started");
});

bot.on("interactionCreate", (interaction: Interaction) => {
  bot.executeInteraction(interaction);
});

bot.on("messageCreate", (message: Message) => {
  bot.executeCommand(message);
});

const client: LemmyHttp = new LemmyHttp(instanceUrl, {
  headers: {
    "User-Agent": "rooki-bot",
  },
});
let jwt: string;

export function getAuth() {
  return jwt;
}

async function start() {
  await connection.initialize();
  const results = await client.login({
    password: process.env.LEMMY_PASSWORD || "",
    username_or_email: process.env.LEMMY_USERNAME || "",
  });

  client.setHeaders({
    "User-Agent": "rooki-bot",
    Authorization: `Bearer ${results.jwt}`,
  });

  if (!results.jwt) {
    throw new Error("Could not log in to Lemmy");
  }
  jwt = results.jwt;
  await importx(__dirname + "/lemmy{Command,Events}/**/*.{ts,js}");

  if (process.env.BOT_TOKEN) {
    await importx(__dirname + "/{events,commands}/**/*.{ts,js}");

    // The following syntax should be used in the ECMAScript environment
    // await importx(`${dirname(import.meta.url)}/{events,commands}/**/*.{ts,js}`);

    // Let's start the bot
    // Log in with your bot token
    await bot.login(process.env.BOT_TOKEN);
  } else {
    console.log("BOT_TOKEN NOT FOUND. Starting server only.");
  }
  startServer();

  typeDiDependencyRegistryEngine.getService(verifiedUserService);
}

start();

export default client;

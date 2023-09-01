import { ContextMenu, Discord, Slash, SlashOption } from "discordx";
import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  CommandInteraction,
  UserContextMenuCommandInteraction,
} from "discord.js";
import getMessages from "../utils/FetchMessages";
import verifiedUserService from "../services/verifiedUserService";
import { Inject } from "typedi";
import { asyncForEach } from "../utils/AsyncForeach";

@Discord()
export default class UserManagement {
  @Inject()
  verifiedUserService: verifiedUserService;

  @ContextMenu({
    type: ApplicationCommandType.User,
    name: "Purge Messages",
    defaultMemberPermissions: ["Administrator"],
  })
  async purgeUserMessages(interaction: UserContextMenuCommandInteraction) {
    if (!interaction.member)
      return await interaction.reply({
        content: "You need to be in a server to use this command!",
        ephemeral: true,
      });

    if (!interaction.channel || interaction.channel.isDMBased())
      return await interaction.reply({
        content: "You need to be in a channel to use this command!",
        ephemeral: true,
      });

    await interaction.deferReply({ ephemeral: true });

    const messages = await getMessages(interaction.channel, -1);
    const userMessages = messages.filter(
      (m) => m.author.id === interaction.targetId
    );

    const messageCount = userMessages.length;
    try {
      const deleteCount = (
        await interaction.channel.bulkDelete(userMessages, true)
      ).filter((x) => x !== undefined).size;

      await interaction.editReply({
        content: `Deleted ${deleteCount} messages from ${messageCount} total messages.`,
      });
    } catch (e) {
      await interaction.editReply({
        content: `Failed to completly delete messages.`,
      });
    }
  }

  @Slash({
    description: "Purge inverified inactive users",
    defaultMemberPermissions: ["Administrator"],
    name: "purgeinactive",
  })
  async purgeUnverifiedInactiveUsers(
    @SlashOption({
      name: "dryrun",
      description: "Don't actually purge users",
      required: false,
      type: ApplicationCommandOptionType.Boolean,
    })
    dryrun: boolean,
    interaction: CommandInteraction
  ) {
    if (!interaction.guild)
      return await interaction.reply(
        "You need to be in a server to use this command!"
      );

    await interaction.deferReply({ ephemeral: true });

    const purgedUsers = await this.verifiedUserService.checkForInactiveUsers(
      interaction.guild,
      dryrun
    );
    const results = [];
    if (!purgedUsers) {
      await interaction.editReply(`No users were purged!`);
      return;
    }
    const usersCount = purgedUsers.length;
    const chunkSize = 15;
    while (purgedUsers.length) {
      results.push(purgedUsers.splice(0, chunkSize));
    }
    await interaction.editReply(`Purged unverified inactive users!`);
    await asyncForEach(results, async (result) => {
      await interaction.followUp({content: result.map(x => `${x.user.toString()} - ${x.reason}`).join("\n"),
      ephemeral: true,
    });
    });
    await interaction.followUp({
      content:
      `${
        dryrun
          ? "This was a dryrun, no users were actually purged."
          : ""
      } Done! Total users purged: ${usersCount}`,
      ephemeral: true,
    },
  
    );
  }
}

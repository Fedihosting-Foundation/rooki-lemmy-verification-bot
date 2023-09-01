import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  CommandInteraction,
  GuildMember,
  UserContextMenuCommandInteraction,
} from "discord.js";
import { ContextMenu, Discord, Slash, SlashOption } from "discordx";
import { Inject } from "typedi";
import verifiedUserService from "../services/verifiedUserService";
import LogHelper from "../helpers/logHelper";
import verifiedUserModel from "../models/verifiedUserModel";
import { GetPersonDetailsResponse } from "lemmy-js-client";
import {
  extractInstanceFromActorId,
  getActorId,
  instanceUrl,
} from "../helpers/lemmyHelper";
import CommunityService from "../services/communityService";

@Discord()
export default class UtilCommands {
  @Inject()
  verifiedUserService: verifiedUserService;

  @Inject()
  communityService: CommunityService;

  @Slash({ name: "ping", description: "Ping!" })
  async ping(interaction: CommandInteraction) {
    await interaction.reply("Pong!");
  }

  personToEmbed(personView: GetPersonDetailsResponse) {
    const baseEmbed = LogHelper.userToEmbed(personView.person_view);

    const moderatorOf = personView.moderates.map((c) => {
      return `[${
        c.community.local
          ? c.community.name
          : getActorId(
              extractInstanceFromActorId(c.community.actor_id),
              c.community.name
            )
      }](${instanceUrl}/c/${
        c.community.local
          ? c.community.name
          : getActorId(
              extractInstanceFromActorId(c.community.actor_id),
              c.community.name
            )
      })`;
    });

    if (moderatorOf.length > 0) {
      const text = "> " + moderatorOf.join("\n> ");
      baseEmbed.addFields([
        {
          name: "Moderator of",
          value: text.length >= 1024 ? text.substring(0, 1021) + "..." : text,
        },
      ]);
    }

    return baseEmbed;
  }

  @Slash({ name: "whois", description: "Get info about a user" })
  async whois(
    @SlashOption({
      name: "user",
      description: "The user to get info about",
      required: false,
      type: ApplicationCommandOptionType.User,
    })
    user: GuildMember | undefined,
    @SlashOption({
      name: "lemmyuser",
      description: "The lemmy user to get info about",
      required: false,
      type: ApplicationCommandOptionType.String,
    })
    lemmyUser: string | undefined,
    interaction: CommandInteraction
  ) {
    if (!interaction.inGuild()) {
      await interaction.reply("This command can only be used in a server!");
      return;
    }

    if (!user && !lemmyUser) {
      user = interaction.member as GuildMember;
    }

    await interaction.deferReply({ ephemeral: true });
    let verifiedUser: verifiedUserModel | null = null;
    if (user) {
      verifiedUser = await this.verifiedUserService.getConnection(
        undefined,
        user.user
      );
    }

    if (lemmyUser) {
      const lemming = await this.verifiedUserService.communityService.getUser({
        name: lemmyUser,
      });
      verifiedUser = await this.verifiedUserService.getConnection(
        lemming?.person_view.person
      );
    }

    if (!verifiedUser) {
      await interaction.editReply("User not found!");
      return;
    }
    const foundUser = await this.communityService.getUser({
      id: verifiedUser.lemmyUser.id,
    });

    if (!foundUser) {
      await interaction.editReply("User not found!");
      return;
    }

    const embed = this.personToEmbed(foundUser);

    await interaction.editReply({
      content: `**Discord:** <@${verifiedUser.discordUser.id}>
**Lemmy:** ${verifiedUser.lemmyUser.name}`,
      embeds: [embed],
      allowedMentions: { repliedUser: false, roles: [], users: [] },
    });
  }

  @ContextMenu({
    type: ApplicationCommandType.User,
    name: "Whois",
  })
  async whoisContextMenu(interaction: UserContextMenuCommandInteraction) {
    await interaction.deferReply({ ephemeral: true });
    const verifiedUser = await this.verifiedUserService.getConnection(
      undefined,
      interaction.targetUser
    );

    if (!verifiedUser) {
      await interaction.editReply("User not found!");
      return;
    }

    const embed = LogHelper.userToEmbed({ person: verifiedUser.lemmyUser });

    await interaction.editReply({
      content: `**Discord:** <@${verifiedUser.discordUser.id}>
**Lemmy:** ${verifiedUser.lemmyUser.name}`,
      embeds: [embed],
      allowedMentions: { repliedUser: false, roles: [], users: [] },
    });
  }
}

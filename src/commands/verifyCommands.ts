import {
  ActionRowBuilder,
  ApplicationCommandOptionType,
  ApplicationCommandType,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  ComponentType,
  EmbedBuilder,
  GuildMember,
  UserContextMenuCommandInteraction,
} from "discord.js";
import {
  ArgsOf,
  ContextMenu,
  Discord,
  On,
  Slash,
  SlashChoice,
  SlashOption,
} from "discordx";
import client, { bot, extended_guilds, getAuth } from "../main";
import LogHelper from "../helpers/logHelper";
import verifiedUserService from "../services/verifiedUserService";
import { Inject } from "typedi";
import communityConfigService from "../services/communityConfigService";
import {
  extractInstanceFromActorId,
  getActorId,
  sleep,
} from "../helpers/lemmyHelper";
import CommunityService from "../services/communityService";
import { asyncForEach } from "../utils/AsyncForeach";

@Discord()
export default class VerifyCommands {
  @Inject()
  communityConfigService: communityConfigService;

  @Inject()
  communityService: CommunityService;

  @Inject()
  verifiedUserService: verifiedUserService;

  @Slash({
    description: "Forces a connection between a lemmy user and discord user",
    name: "forceverify",
    defaultMemberPermissions: ["Administrator"],
  })
  async forceverify(
    @SlashOption({
      description: "The user account URL on Lemmy.world.",
      name: "userid",
      required: true,
      type: ApplicationCommandOptionType.String,
    })
    userId: string,
    @SlashOption({
      description: "The discord user you want to connect to",
      name: "discorduser",
      required: true,

      type: ApplicationCommandOptionType.User,
    })
    discordUser: GuildMember,
    interaction: CommandInteraction
  ) {
    if (!interaction.guildId)
      return interaction.reply("This command can only be used in a server");
    const username = userId.includes("/") ? userId.split("/").pop() : userId;
    if (!username)
      return interaction.reply({
        content: "Invalid username",
        ephemeral: true,
      });
    await interaction.deferReply({ ephemeral: true });

    const config = await this.communityConfigService.getCommunityConfig(
      interaction.guildId
    );
    if (!config || !config.verifiedRole)
      return interaction.editReply(
        "This community has not been configured yet"
      );
    try {
      const user = await this.communityService.getUser({ name: username });
      if (!user) {
        await interaction.editReply("User not found!");
        return;
      }

      const member = await interaction.guild?.members.fetch(discordUser.id);
      if (!member) {
        await interaction.editReply("Something went wrong");
        return;
      }
      await this.verifiedUserService.createConnection(user, discordUser.user);

      await member.roles.add(config.verifiedRole!);

      await interaction.editReply("User is now verified!");
    } catch (e) {
      await interaction.editReply("Something went wrong!");
      console.log(e);
    }
  }

  @Slash({ description: "Verify a lemmy account", name: "verify" })
  async verify(
    @SlashOption({
      description: "The user account URL on Lemmy.world.",
      name: "userid",
      required: true,
      type: ApplicationCommandOptionType.String,
    })
    userId: string,
    @SlashOption({
      description: "The code you got in your dms",
      name: "code",
      type: ApplicationCommandOptionType.String,
    })
    code: string | undefined,
    interaction: CommandInteraction
  ) {
    if (!interaction.guildId)
      return interaction.reply("This command can only be used in a server");
    await interaction.deferReply({ ephemeral: true });

    const username = userId.includes("/") ? userId.split("/").pop() : userId;

    const config = await this.communityConfigService.getCommunityConfig(
      interaction.guildId
    );
    if (!config || !config.verifiedRole)
      return interaction.editReply(
        "This community has not been configured yet"
      );
    try {
      if (code) {
        const verified = this.verifiedUserService.verifyCode(
          Number(code),
          false
        );
        if (verified.length === 0) {
          await interaction.editReply("Code not found!");
          return;
        }

        const user = verified[0].lemmyUser;
        if (
          (user.person_view.person.local
            ? user.person_view.person.name
            : getActorId(
                extractInstanceFromActorId(user.person_view.person.actor_id),
                user.person_view.person.name
              )) !== username
        ) {
          await interaction.editReply("Code invalid!");
          return;
        }
        try {
          const data = this.verifiedUserService.verifyCode(parseInt(code));
          await this.verifiedUserService.createConnection(
            user,
            data[0].discordUser.user
          );

          await interaction.editReply("You are now verified!");
        } catch (exc) {
          console.log(exc);
          interaction.editReply("Something went wrong");
        }
        return;
      }
      const user = await client.getPersonDetails({
        username: username,
      });

      if (!user) {
        interaction.editReply("User not found!");
        return;
      }

      const embed = LogHelper.userToEmbed(user.person_view);

      const acceptButton = new ButtonBuilder()
        .setCustomId("verify-user")
        .setLabel("Yes, this is me!")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("✅");

      const denyButton = new ButtonBuilder()
        .setCustomId("deny-user")
        .setLabel("No, this is not me!")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("❌");

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        acceptButton,
        denyButton
      );

      const message = await interaction.editReply({
        content: "Is this you? ( Please answer within 30 seconds!)",
        embeds: [embed],
        components: [row],
      });

      const filter = (i: any) =>
        i.user.id === interaction.user.id &&
        i.isButton() &&
        i.message.id === message.id;
      const collector = interaction.channel?.createMessageComponentCollector({
        filter,
        componentType: ComponentType.Button,
        maxUsers: 1,
        time: 30000,
      });
      collector?.on("end", async (collected) => {
        if (collected.size === 0) {
          await interaction.editReply({
            content: "You did not answer in time!",
            components: [],
          });
        }
      });
      collector?.on("collect", async (i) => {
        await i.deferReply({ ephemeral: true });
        try {
          if (i.customId === "verify-user") {
            const code = await this.verifiedUserService.createVerificationCode(
              user,
              interaction.member as GuildMember
            );
            client.createPrivateMessage({
              recipient_id: user.person_view.person.id,
              content: `Hello ${user.person_view.person.name}! 

If you requested a verification message from discord, then verify yourself with:

1. Executing the verify command in discord like this: \`/verify userid:${userId} code:${code}\`  
2. Following this link: ${process.env.PUBLIC_URL}/verify/${code} 

This is to verify that you are the owner of the discord account \`${interaction.user.tag}\`!  
If you did not request this verification, please ignore this message! If I keep sending you messages, please block me!  

This message is automated! Please dont reply to this message!`,
            });

            await i.editReply({
              content:
                "Ok, I will send you a dm on lemmy with a verification code!",
            });
          }
          if (i.customId === "deny-user") {
            await i.editReply({
              content: "Ok!",
            });
          }
        } catch (exc) {
          console.log(exc);
          await i.editReply({
            content: "Something went wrong! Are you already verified?",
          });
        }
      });
    } catch (exc) {
      console.log(exc);
      interaction.editReply("Something went wrong ( User not found? )");
    }
  }

  @Slash({
    description: "Unverify someone!",
    name: "unverify",
    defaultMemberPermissions: ["ManageRoles"],
  })
  async unverify(
    @SlashOption({
      name: "user",
      description: "The user to unverify",
      type: ApplicationCommandOptionType.User,
      required: true,
    })
    user: GuildMember,
    interaction: CommandInteraction
  ) {
    if (!interaction.guildId)
      return interaction.reply("This command can only be used in a guild!");
    await interaction.deferReply({ ephemeral: true });
    const config = await this.communityConfigService.getCommunityConfig(
      interaction.guildId
    );
    if (!config || !config.verifiedRole)
      return interaction.reply("Community not configured!");
    try {
      if (!user) {
        await interaction.editReply("Something went wrong");
        return;
      }

      if (extended_guilds.includes(interaction.guildId)) {
        await asyncForEach(user.roles.cache.toJSON(), async (role) => {
          if (role.managed || !role.name.startsWith("c/")) return;
          await user.roles.remove(role);
          await sleep(1000);
        });
      }

      await user.roles.remove(config.verifiedRole!);

      await this.verifiedUserService.removeConnection(
        undefined,
        undefined,
        user.user
      );

      await interaction.editReply(`${user.user.tag} is now unverified!`);
    } catch (exc) {
      console.log(exc);
      interaction.editReply(
        "Something went wrong ( User didnt had a connection? )"
      );
    }
  }

  @On({ event: "guildMemberUpdate" })
  async onGuildMemberUpdate([
    oldMember,
    newMember,
  ]: ArgsOf<"guildMemberUpdate">) {
    if (
      !oldMember.user.bot &&
      ((oldMember.pending && !newMember.pending) ||
        !newMember.guild.features.includes("MEMBER_VERIFICATION_GATE_ENABLED"))
    ) {
      const config = await this.communityConfigService.getCommunityConfig(
        newMember.guild.id
      );
      if (!config || !config.verifiedRole || !config.welcomeChannel) return;

      const welcomeChannel = await newMember.guild.channels.fetch(
        config.welcomeChannel
      );

      if (!welcomeChannel || !welcomeChannel.isTextBased()) return;

      const embed = new EmbedBuilder()

        .setTitle(`Welcome ${newMember.displayName}!`)
        .setDescription(
          `Welcome to ${newMember.guild.name}! 
          
The Rules are simple: 

They are the same as in the [lemmy.world](https://mastodon.world/about) instance and of course use your brain!
More information can be found in #rules !

**How to get verified**:

> 1. Go to your profile directly or if you are a federated User Search yourself on https://lemmy.world/
> 2. Click on your profile
> 3. Copy the profile URL
> 4. Execute the verify command in discord like this: \`/verify userid:Cookie\` or \`/verify userid:https://lemmy.world/u/Cookie\`
For example:

Local Users: \`/verify userid:Cookie\`
Federated Users: \`/verify userid:Cookie@example.lemmy\`
          
Have fun!`
        )
        .setColor("#00ff00")
        .setThumbnail(newMember.user.displayAvatarURL())
        .setFooter({ text: "This message is automated!" });

      await welcomeChannel.send({
        content: `${newMember.toString()}`,
        embeds: [embed],
      });
    }
  }

  @ContextMenu({
    type: ApplicationCommandType.User,
    name: "Unverify",
    defaultMemberPermissions: ["ManageRoles"],
  })
  async unverifyContextMenu(interaction: UserContextMenuCommandInteraction) {
    if (!interaction.guildId)
      return interaction.reply({
        content: "This command can only be used in a guild!",
        ephemeral: true,
      });
    await interaction.deferReply({ ephemeral: true });
    const config = await this.communityConfigService.getCommunityConfig(
      interaction.guildId
    );
    if (!config || !config.verifiedRole)
      return interaction.reply("Community not configured!");
    try {
      const user = interaction.targetMember as GuildMember;
      if (!user) {
        await interaction.editReply("Something went wrong");
        return;
      }

      if (extended_guilds.includes(interaction.guildId)) {
        await asyncForEach(user.roles.cache.toJSON(), async (role) => {
          if (role.managed || !role.name.startsWith("c/")) return;
          await user.roles.remove(role);
          await sleep(1000);
        });
      }

      await user.roles.remove(config.verifiedRole!);

      await this.verifiedUserService.removeConnection(
        undefined,
        undefined,
        user.user
      );
      await interaction.editReply(`${user.user.tag} is now unverified!`);
    } catch (exc) {
      console.log(exc);
      interaction.editReply(
        "Something went wrong ( User didnt had a connection? )"
      );
    }
  }

  @Slash({
    description: "Clear all broken connections",
    name: "clearconnections",
    defaultMemberPermissions: ["ManageRoles"],
  })
  async clearconnections(
    @SlashOption({
      name: "dryrun",
      description: "Don't actually clear the connections, just show them",
      type: ApplicationCommandOptionType.Boolean,
      required: true,
    })
    dryrun: boolean,
    interaction: CommandInteraction
  ) {
    interaction.deferReply({ ephemeral: true });
    var cleared_connections =
      this.verifiedUserService.clearBrokenConnections(dryrun);

    await interaction.reply(
      `Cleared ${(await cleared_connections).length} connections!`
    );
  }
}

import { Discord, Slash, SlashGroup, SlashOption } from "discordx";
import verifiedUserService from "../services/verifiedUserService";
import { Inject } from "typedi";
import communityConfigService from "../services/communityConfigService";
import CommunityService from "../services/communityService";
import { ApplicationCommandOptionType, Channel, ChannelType, CommandInteraction, GuildTextBasedChannel, Role } from "discord.js";

@Discord()
@SlashGroup({ name: "settings", description: "Community Settings Commands", defaultMemberPermissions: ["Administrator"] })
@SlashGroup("settings")
export default class CommunityConfigCommands {
  @Inject()
  verifiedUserService: verifiedUserService;

  @Inject()
  communityConfigService: communityConfigService;

  @Slash({description: "Set the verified role for this community", name: "setverifiedrole"})
  async setVerifiedRole(
    @SlashOption({
      name: "role",
      description: "The role to set as the verified role",
      required: true,
      type: ApplicationCommandOptionType.Role,
    })
    role: Role,
    @SlashOption({
      name: "welcomechannel",
      description: "The channel to send welcome 'hint' messages in",
      required: true,
      type: ApplicationCommandOptionType.Channel,
      channelTypes: [ChannelType.GuildText]
    })
    welcomeChannel: GuildTextBasedChannel,
    interaction: CommandInteraction
  ) {
    if(!interaction.guildId) return interaction.reply("This command can only be used in a server")
    await interaction.deferReply({ ephemeral: true })

    let config = await this.communityConfigService.getCommunityConfig(interaction.guildId)

    if(!config) {
      config = await this.communityConfigService.createCommunityConfig(interaction.guildId)
    }
    config.verifiedRole = role.id
    config.welcomeChannel = welcomeChannel.id
    await this.communityConfigService.updateCommunityConfig(config)

    return interaction.editReply(`The verified role has been set to ${role.name}`)
  }
}

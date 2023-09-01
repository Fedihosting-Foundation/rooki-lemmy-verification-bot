import { ChannelType, Guild } from "discord.js";
import { bot } from "../main";
import communityConfigModel from "../models/communityConfigModel";
import { Community, CommunityView } from "lemmy-js-client";

export async function getUser(id: string) {
  try {
    return await bot.users.fetch(id);
  } catch (exc) {
    console.log(exc);
  }
}

export async function getOrCreateEmptyCategory(
  guild: Guild,
  config: communityConfigModel
 ) {
    const channels = config.communityCatgory.map((x) =>
      guild.channels.fetch(x)
    );

    const resolvedChannels = await Promise.all(channels);
    const foundAvailableChannel = resolvedChannels.find(x => x?.type === ChannelType.GuildCategory && x.children.cache.size <= 50)
    if(foundAvailableChannel) return foundAvailableChannel;

    const createdChannel = await guild.channels.create({name: "Lemmy Communities", type: ChannelType.GuildCategory,reason: "No empty category found"});
    return createdChannel;
}


export async function findConfigForCommunity(
  config: communityConfigModel,
  community: Community
){
  return config.communities.find(x => x.communityId === community.id);
}

export async function isCommunityViable(community: CommunityView){
  return community.counts.subscribers > 2500 && community.counts.posts > 25;
}
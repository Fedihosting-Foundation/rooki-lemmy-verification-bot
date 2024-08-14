import {
  GetPersonDetails,
  GetPersonDetailsResponse,
  Person,
  PersonView,
} from "lemmy-js-client";
import { Inject, Service } from "typedi";
import "reflect-metadata";
import verifiedUserRepository from "../repository/verifiedUserRepository";
import { BaseGuildTextChannel, DiscordAPIError, Guild, GuildMember, User } from "discord.js";
import { ObjectId } from "mongodb";
import CommunityService from "./communityService";
import BetterQueue from "better-queue";
import verifiedUserModel from "../models/verifiedUserModel";
import { bot, extended_guilds } from "../main";
import communityConfigService from "./communityConfigService";
import {
  extractInstanceFromActorId,
  getActorId,
  sleep,
} from "../helpers/lemmyHelper";
import { asyncForEach } from "../utils/AsyncForeach";
import {
  findConfigForCommunity,
  getOrCreateEmptyCategory,
  isCommunityViable,
} from "../helpers/discordHelper";
import { asyncFilter } from "../utils/AsyncFilter";

@Service()
class verifiedUserService {
  @Inject()
  repository: verifiedUserRepository;

  @Inject()
  communityService: CommunityService;

  @Inject()
  communityConfigService: communityConfigService;

  userQueue: BetterQueue<verifiedUserModel> = new BetterQueue({
    process: async (data: verifiedUserModel[], cb) => {
      const users = data.flat();
      users.forEach(async (user) => {
        try {
          const discordUser = user.discordUser;
          if (!discordUser) {
            console.log(
              `User ${
                user.discordUser.username || user.discordUser.id
              } not found!`
            );
            return;
          }
          const lemmyUser = await this.communityService.getUser(
            {
              id: user.lemmyUser.id,
            },
            true
          );

          if (!lemmyUser) {
            return;
          }

          await asyncForEach(bot.guilds.cache.toJSON(), async (guild) => {
            const communityConfig =
              await this.communityConfigService.getCommunityConfig(guild.id);
            if (!communityConfig || !communityConfig.quarantineRole) {
              return;
            }
            const role = guild?.roles.cache.get(communityConfig.quarantineRole);
            if (!role) {
              return;
            }
            guild.members
              .fetch(user.discordUser.id)
              .then(async (member) => {
                if (!member.manageable) {
                  return;
                }
                if (
                  !member.roles.cache.has(role.id) &&
                  lemmyUser.person_view.person.banned
                ) {
                  await member.roles.add(role);
                } else if (
                  member.roles.cache.has(role.id) &&
                  !lemmyUser.person_view.person.banned
                ) {
                  await member.roles.remove(role);
                }
              })
              .catch((e) => {
                console.log("User not found! " + user.discordUser.id);
                console.log(e);
              });
            await sleep(1000);
          });

          user.discordUser = discordUser;
          user.lemmyUser = lemmyUser.person_view.person;
          await this.repository.save(user);
          console.log(
            `Updated ${user.discordUser.username || user.discordUser.id}`
          );
        } catch (e) {
          if(e instanceof DiscordAPIError){
            console.log("Discord API Error");
            console.log(e);
            if(e.code === 10007){
              console.log("Removing user from database");
              await this.removeConnection(undefined, undefined, user.discordUser);
            }
          }
          console.log(e);
        }
      });
      cb(null, data);
    },
    batchDelay: 500,    
    batchSize: 2,
    afterProcessDelay: 15000,
  });

  constructor() {
    setInterval(() => {
      this.repository.findAll().then((users) => {
        users.forEach((user) => {
          this.userQueue.push(user);
        });
      });
    }, 1000 * 60 * 5);
    this.userQueue.resume();
  }

  codes: {
    code: number;
    lemmyUser: GetPersonDetailsResponse;
    discordUser: GuildMember;
  }[] = [];

  async applyRoles(lemmyDetails: GetPersonDetailsResponse, discordUser: User) {
    const lemmyUser = lemmyDetails.person_view;
    try {
      await asyncForEach(bot.guilds.cache.toJSON(), async (guild) => {
        let user: GuildMember | undefined;

        try {
          user = await guild?.members.fetch(discordUser.id);
        } catch (e) {
          console.log("Failed to fetch user from guild - applyRoles");
          console.log(e);
        }
        if (!user) return;
        try {
          const shortenedName =
            lemmyDetails.person_view.person.name.length >= 32
              ? lemmyDetails.person_view.person.name.substring(0, 28) + "..."
              : lemmyDetails.person_view.person.name;
          const name = lemmyDetails.person_view.person.local
            ? shortenedName
            : getActorId(
                extractInstanceFromActorId(
                  lemmyDetails.person_view.person.actor_id
                ),
                shortenedName
              );
          user
            .edit({
              nick: name,
              reason: "Verified the user",
            })
            .catch((x) => {
              console.log("Couldnt rename user" + x);
            });
        } catch (e) {
          console.log(e);
          console.log("Failed to set the nickname!");
        }

        const communityConfig =
          await this.communityConfigService.getCommunityConfig(guild.id);

        if (!communityConfig) {
          console.log("Community not configured!");
          return;
        }

        if (extended_guilds.includes(guild.id)) {
          const communities = await asyncFilter(
            lemmyDetails.moderates,
            async (x) => {
              const foundC = await this.communityService.getCommunity({
                id: x.community.id,
              });
              if (!foundC) return false;
              return await isCommunityViable(foundC.community_view);
            }
          );

          await asyncForEach(communities, async (community) => {
            const foundC = await this.communityService.getCommunity({
              id: community.community.id,
            });
            if (!foundC) return;
            const foundChannel = await findConfigForCommunity(
              communityConfig,
              foundC.community_view.community
            );
            if (foundChannel) {
              user?.roles.add(foundChannel.roleId);
            } else {
              if (
                guild.channels.cache.size >= 499 ||
                (await guild.roles.fetch()).size >= 249
              )
                return;
              const createdChannel: {
                communityId: number;
                channelId: string;
                roleId: string;
              } = {
                communityId: foundC.community_view.community.id,
                channelId: "",
                roleId: "",
              };
              const category = await getOrCreateEmptyCategory(
                guild,
                communityConfig
              );
              communityConfig.communityCatgory.push(category.id);
              const role = await guild.roles.create({
                name: ("c/" + foundC.community_view.community.name).substring(
                  0,
                  90
                ),
                reason: "Community Community Moderation",
              });

              const channel = await guild.channels.create({
                name: foundC.community_view.community.name.substring(0, 99),
                parent: category.id,
                reason: "Community Community Moderation",
                topic: `Moderation discussions about ${foundC.community_view.community.name} should be held here.`,
                permissionOverwrites: [
                  {
                    id: guild.roles.everyone.id,
                    deny: ["SendMessages", "ViewChannel"],
                  },
                  {
                    id: role.id,
                    allow: [
                      "SendMessages",
                      "ViewChannel",
                      "ReadMessageHistory",
                    ],
                  },
                ],
              });
              createdChannel.channelId = channel.id;
              createdChannel.roleId = role.id;
              communityConfig.communities.push(createdChannel);

              await user?.roles.add(role.id);
            }

            await sleep(1000);
          });
          await this.communityConfigService.updateCommunityConfig(
            communityConfig
          );
        }

        if (communityConfig.verifiedRole) {
          await user.roles.add(communityConfig.verifiedRole);
        }

        if (!communityConfig.logChannel) {
          console.log("Log channel not configured!");
          return;
        }
        const channel =
          (guild.channels.cache.get(
            communityConfig.logChannel
          ) as BaseGuildTextChannel) ||
          ((await guild.channels.fetch(
            communityConfig.logChannel
          )) as BaseGuildTextChannel);
        if (!channel) throw new Error("Channel not found!");
        await channel.send(
          `**${discordUser.toString()}** has been verified with the lemmy user ${
            !lemmyUser.person.local
              ? getActorId(
                  extractInstanceFromActorId(lemmyUser.person.actor_id),
                  lemmyUser.person.name
                )
              : lemmyUser.person.name
          }!`
        );
        await sleep(1000);
      });
    } catch (e) {
      console.log(e);
    }
  }

  async createConnection(
    lemmyDetails: GetPersonDetailsResponse,
    discordUser: User
  ) {
    await this.applyRoles(lemmyDetails, discordUser);
    const conn = await this.getConnection(lemmyDetails.person_view.person);
    if (conn) {
      return;
    }
    const createdConfig = this.repository.create();
    const lemmyUser = lemmyDetails.person_view;
    createdConfig.lemmyUser = lemmyUser.person;
    createdConfig.discordUser = discordUser;

    return await this.repository.save(createdConfig);
  }

  async removeConnection(
    id?: ObjectId,
    lemmyUser?: Person,
    discordUser?: User
  ) {
    const query = id
      ? { _id: { $eq: id } }
      : lemmyUser
      ? { "lemmyUser.id": { $eq: lemmyUser.id } }
      : { "discordUser.id": { $eq: discordUser?.id } };
    const found = await this.repository.findOne({
      where: query,
    });

    if (!found) throw new Error("Connection not found!");
    try {
      await asyncForEach(bot.guilds.cache.toJSON(), async (guild) => {
        const communityConfig =
          await this.communityConfigService.getCommunityConfig(guild.id);

        if (!communityConfig || !communityConfig.logChannel)
          throw new Error("Community not configured!");
        const channel =
          (guild.channels.cache.get(
            communityConfig.logChannel
          ) as BaseGuildTextChannel) ||
          ((await guild.channels.fetch(
            communityConfig.logChannel
          )) as BaseGuildTextChannel);
        if (!channel) throw new Error("Channel not found!");
        await channel.send(
          `**${
            discordUser
              ? discordUser.toString()
              : lemmyUser && !lemmyUser.local
              ? getActorId(
                  extractInstanceFromActorId(lemmyUser.actor_id),
                  lemmyUser.name
                )
              : lemmyUser?.name || "No name????"
          }** has been unverified!`
        );
      });
    } catch (e) {
      console.log(e);
    }
    return await this.repository.remove(found);
  }

  async getConnection(lemmyUser?: Person, discordUser?: User) {
    const query = lemmyUser
      ? { "lemmyUser.id": { $eq: lemmyUser.id } }
      : { "discordUser.id": { $eq: discordUser?.id } };
    return await this.repository.findOne({
      where: query,
    });
  }

  async isModeratorOf(discordUser: User, communityId: number) {
    if (discordUser.id === process.env.DEV_USER_ID) return true;
    const connection = await this.getConnection(undefined, discordUser);
    if (!connection) return false;
    const community = await this.communityService.getCommunity({
      id: communityId,
    });
    return (
      (community &&
        community.moderators.some(
          (m) => m.moderator.id === connection.lemmyUser.id
        ))
    );
  }

  verifyCode(code: number, remove = true) {
    const index = this.codes.findIndex((c) => c.code === code);
    if (index < 0) return [];
    return remove ? this.codes.splice(index, 1) : [this.codes[index]];
  }

  async createVerificationCode(
    person: GetPersonDetailsResponse,
    discordUser: GuildMember
  ) {
    let conn = await this.getConnection(person.person_view.person, undefined);
    // if (conn) throw new Error("User already connected!");
    conn = await this.getConnection(undefined, discordUser.user);
    // if (conn) throw new Error("User already connected!");

    const code = Math.round(
      person.person_view.person.id +
        (Math.random() * 100) / 100 +
        Math.random() *
          (person.person_view.counts.post_count +
            person.person_view.counts.comment_count +
            Math.random() * 100)
    );
    this.codes.push({
      code: code,
      lemmyUser: person,
      discordUser: discordUser,
    });
    setTimeout(() => {
      const index = this.codes.findIndex((c) => c.code === code);
      if (index < 0) return;
      this.codes.splice(index, 1);
    }, 1200000);
    return code;
  }

  async checkForInactiveUsers(guild: Guild, dryrun = false) {
    const users = await guild.members.fetch();
    console.log(users.toJSON());
    const purgedUsers: { user: GuildMember; reason: string }[] = [];
    const config = await this.communityConfigService.getCommunityConfig(
      guild.id
    );
    if (!config || !config.verifiedRole) return;

    await asyncForEach(users.toJSON(), async (user, i) => {
      if (
        user.kickable &&
        !user.user.bot &&
        user.roles.cache.size === 1 &&
        user.roles.highest.id === user.guild.roles.everyone.id &&
        user.joinedAt &&
        user.joinedAt.getTime() < new Date().getTime() - 1000 * 60 * 60 * 24 * 3
      ) {
        if (!config || !config.verifiedRole) return;

        if (user.roles.cache.has(config.verifiedRole)) return;

        try {
          if (!dryrun) {
            await user.kick("Inactive user and not verified!");
          }
          purgedUsers.push({
            user: user,
            reason: `Inactive user and not verified! Inactive Time: ${Math.floor(
              new Date(
                new Date().getTime() - user.joinedAt.getTime()
              ).getTime() /
                1000 /
                60 /
                60 /
                24
            )} Days`,
          });
        } catch (e) {
          console.log(e);
        }
      }
      if (i % 5 === 0) sleep(1000);
    });
    return purgedUsers;
  }
}

export default verifiedUserService;

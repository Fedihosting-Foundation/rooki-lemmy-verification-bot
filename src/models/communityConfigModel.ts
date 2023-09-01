import { Community } from "lemmy-js-client";
import { Column, Entity } from "typeorm";
import baseModel from "./baseModel";

@Entity({ name: "rooki_community_config" })
export default class communityConfigModel extends baseModel {
  @Column()
  guildId!: string;

  @Column()
  verifiedRole?: string;

  @Column()
  welcomeChannel?: string;

  @Column()
  logChannel?: string;

  @Column()
  quarantineRole?: string;

  @Column()
  communityCatgory: string[] = [];

  @Column()
  communities: {communityId: number, channelId: string, roleId: string}[] = [];
}

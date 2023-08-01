import { Community } from "lemmy-js-client";
import { Column, Entity } from "typeorm";
import baseModel from "./baseModel";
import {
} from "./iConfig";

@Entity({ name: "rooki_community_config" })
export default class communityConfigModel extends baseModel {
  @Column()
  guildId!: string;

  @Column()
  verifiedRole?: string;

  @Column()
  welcomeChannel?: string;
}

import { Community } from "lemmy-js-client";
import { Inject, Service } from "typedi";
import "reflect-metadata";
import communityConfigRepository from "../repository/communityConfigRepository";
import CommunityService from "./communityService";
import communityConfigModel from "../models/communityConfigModel";

@Service()
class communityConfigService {
  @Inject()
  repository: communityConfigRepository;

  @Inject()
  CommunityService: CommunityService;

  async getCommunities() {
    return await this.repository.findAll();
  }

  async createCommunityConfig(guildId: string) {
    const createdConfig = this.repository.create();
    createdConfig.guildId = guildId;
    return await this.repository.save(createdConfig);
  }

  async getCommunityConfig(guildId: string) {
    return await this.repository.findOne({
      where: { guildId: { $eq: guildId } },
    });
  }

  async removeCommunityConfig(config: communityConfigModel) {
    return await this.repository.delete(config);
  }

  async updateCommunityConfig(config: communityConfigModel) {
    return await this.repository.save(config);
  }
}

export default communityConfigService;

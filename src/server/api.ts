import express from "express";
import verifiedUserService from "../services/verifiedUserService";
import { typeDiDependencyRegistryEngine } from "discordx";
import communityConfigService from "../services/communityConfigService";
import { bot } from "../main";

let verifiedServ: verifiedUserService | null;

function getVerifiedService() {
  if (!verifiedServ) {
    verifiedServ =
      typeDiDependencyRegistryEngine.getService(verifiedUserService);
  }
  return verifiedServ;
}
let commConfigService: communityConfigService | null;

function getCommunityConfigService() {
  if (!commConfigService) {
    commConfigService = typeDiDependencyRegistryEngine.getService(
      communityConfigService
    );
  }
  return commConfigService;
}

const app = express();

app.get("/", (req, res) => {
  res.send("Hello There!");
});

app.get("/verify/:code", async (req, res) => {
  try {
    const code = parseInt(req.params.code);
    const verifiedService = getVerifiedService();
    if (!verifiedService) {
      res.status(500).send("Error: Service not found");
      return;
    }
    const verified = verifiedService.verifyCode(code);
    if (verified.length === 0) {
      res.status(404).send("Code not found!");
      return;
    }
    const user = verified[0].lemmyUser;
    const discordUser = verified[0].discordUser;

    const config = await getCommunityConfigService()?.getCommunityConfig(
      discordUser.guild.id
    );

    if (!config || !config.verifiedRole) {
      res.status(500).send("Error: Community not configured");
      return;
    }

    await discordUser.roles.add(config.verifiedRole);

    await verifiedService.createConnection(user, discordUser.user);
    res.send("Successfully authenticated! You can close this page now!");
  } catch (e) {
    console.log(e);
  }
});

export function startServer() {
  const port = process.env.EXPRESS_PORT || 3000;
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}

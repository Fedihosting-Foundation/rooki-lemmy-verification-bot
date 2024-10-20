import express from "express";
import verifiedUserService from "../services/verifiedUserService";
import { typeDiDependencyRegistryEngine } from "discordx";
import communityConfigService from "../services/communityConfigService";
import { RateLimiterMemory } from "rate-limiter-flexible";

let verifiedServ: verifiedUserService | null;
const opts = {
  points: 2,
  duration: 60 * 5,
};
const rateLimiter = new RateLimiterMemory(opts);
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
    try {
      const rateLimiterRes = await rateLimiter.consume(req.ip);
      const headers = {
        "Retry-After": rateLimiterRes.msBeforeNext / 1000,
        "X-RateLimit-Limit": opts.points,
        "X-RateLimit-Remaining": rateLimiterRes.remainingPoints,
        "X-RateLimit-Reset": new Date(Date.now() + rateLimiterRes.msBeforeNext),
      };
      res.set(headers);
    } catch (rateLimiterRes: any) {
      const headers = {
        "Retry-After": rateLimiterRes.msBeforeNext / 1000,
        "X-RateLimit-Limit": opts.points,
        "X-RateLimit-Remaining": rateLimiterRes.remainingPoints,
        "X-RateLimit-Reset": new Date(Date.now() + rateLimiterRes.msBeforeNext),
      };
      res.set(headers);
      res
        .status(429)
        .send(
          "Too many requests! Try again in " +
            rateLimiterRes.msBeforeNext +
            "ms"
        );
      return;
    }
    const code = Number(req.params.code);
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
    try {
      const rateLimiterRes = await rateLimiter.consume(
        user.person_view.person.id
      );
      const headers = {
        "Retry-After": rateLimiterRes.msBeforeNext / 1000,
        "X-RateLimit-Limit": opts.points,
        "X-RateLimit-Remaining": rateLimiterRes.remainingPoints,
        "X-RateLimit-Reset": new Date(Date.now() + rateLimiterRes.msBeforeNext),
      };
      res.set(headers);
    } catch (rateLimiterRes: any) {
      const headers = {
        "Retry-After": rateLimiterRes.msBeforeNext / 1000,
        "X-RateLimit-Limit": opts.points,
        "X-RateLimit-Remaining": rateLimiterRes.remainingPoints,
        "X-RateLimit-Reset": new Date(Date.now() + rateLimiterRes.msBeforeNext),
      };
      res.set(headers);
      res
        .status(429)
        .send(
          "Too many requests for that user! Try again in " +
            rateLimiterRes.msBeforeNext +
            "ms"
        );
      return;
    }
    const config = await getCommunityConfigService()?.getCommunityConfig(
      discordUser.guild.id
    );

    if (!config) {
      res.status(500).send("Error: Community not configured");
      return;
    }
    try {
      await verifiedService.createConnection(user, discordUser.user);
      console.log(
        `Connection created for ${user.person_view.person.name} and ${discordUser.user.username} in ${discordUser.guild.name}!`
      );
    } catch (e) {
      console.log(
        `Error creating connection for ${user.person_view.person.name} and ${discordUser.user.username} in ${discordUser.guild.name}!`
      );
      console.error(e);
    }

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

import {
  Message,
  Collection,
  TextBasedChannel,
} from "discord.js";

export default async function getMessages(
  channel: TextBasedChannel,
  limit: number = 100
): Promise<Message[]> {
  let out: Message[] = [];
  if (limit != -1 && limit <= 100) {
    let messages: Collection<string, Message> = await channel.messages.fetch({
      limit: limit,
    });
    out.push(...messages.map((x) => x));
  } else if (limit == -1) {
    let last_id: string | undefined = "";
    while (true) {
      const options: { limit: number; before?: string } = {
        limit: 100,
      };
      if (last_id && last_id.length > 0) {
        options.before = last_id;
      }
      const messages: Collection<string, Message> =
        await channel.messages.fetch(options);
      out.push(...messages.map((x) => x));
      if (messages.size < 100) break;
      last_id = messages.at(messages.size - 1)?.id;
    }
  } else {
    let rounds = limit / 100 + (limit % 100 ? 1 : 0);
    let last_id: string | undefined = "";
    for (let x = 0; x < rounds; x++) {
      const options: { limit: number; before?: string } = {
        limit: 100,
      };
      if (last_id && last_id.length > 0) {
        options.before = last_id;
      }
      const messages: Collection<string, Message> =
        await channel.messages.fetch(options);
      out.push(...messages.map((x) => x));
      if (messages.size < 100) continue;
      last_id = messages.at(messages.size - 1)?.id;
    }
  }
  return out;
}

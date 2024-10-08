import { EmbedBuilder } from "discord.js";
import {
  Post,
  Person,
  Community,
  CommentAggregates,
  PostAggregates,
  PostReportView,
  CommentReportView,
  Comment,
  PersonAggregates,
} from "lemmy-js-client";
import {
  extractInstanceFromActorId,
  getActorId,
  instanceUrl,
} from "./lemmyHelper";

export default class LogHelper {
  static commentToEmbed({
    post,
    comment,
    creator,
    community,
    counts,
  }: {
    post: Post;
    comment: Comment;
    creator: Person;
    community: Community;
    counts: CommentAggregates;
  }) {
    const embed = new EmbedBuilder()
      .setTitle("Commented:")
      .setDescription(
        (comment.content && comment.content.length > 4000
          ? comment.content.slice(0, 4000) + "..."
          : comment.content) || "No Comment body?????"
      )
      .setAuthor({
        name: creator.name,
        iconURL: creator.avatar ? creator.avatar : undefined,
      })
      .setURL(`${instanceUrl}/comment/${comment.id}`)
      .setTimestamp(new Date(counts.published))
      .setFooter({
        text: `Posted in ${community.name}`,
        iconURL: community.icon ? `${community.icon}` : undefined,
      });
    embed.addFields([
      {
        name: "Votes",
        value: `${counts.upvotes} Upvotes | ${counts.downvotes} Downvotes`,
        inline: true,
      },
      {
        name: "Replies",
        value: `${counts.child_count}`,
        inline: true,
      },
      {
        name: "Deleted",
        value:
          comment.deleted || comment.removed
            ? comment.removed
              ? "Removed by moderator"
              : "Yes"
            : "No",
        inline: true,
      },
      {
        name: "Parent NSFW",
        value: post.nsfw ? "Yes" : "No",
        inline: true,
      },
    ]);
    if (comment.removed) embed.setColor(0xff0000);

    return embed;
  }

  static postToEmbed({
    post,
    creator,
    community,
    counts,
  }: {
    post: Post;
    creator: Person;
    community: Community;
    counts: PostAggregates;
  }) {
    const embed = new EmbedBuilder()
      .setTitle(
        post.name.length > 256 ? post.name.slice(0, 250) + "..." : post.name
      )
      .setURL(`${instanceUrl}/post/${post.id}`)
      .setAuthor({
        name: creator.name,
        iconURL: creator.avatar ? creator.avatar : undefined,
      })
      .setDescription(
        (post.body && post.body.length > 4000
          ? post.body.slice(0, 4000) + "..."
          : post.body) || "No Body"
      )
      .setTimestamp(new Date(counts.published))
      .setFooter({
        text: `Posted in ${community.name}`,
        iconURL: community.icon ? `${community.icon}` : undefined,
      })
      .setColor(0x00ff00);

    embed.addFields([
      {
        name: "Votes",
        value: `${counts.upvotes} Upvotes | ${counts.downvotes} Downvotes`,
        inline: true,
      },
      {
        name: "Comments",
        value: `${counts.comments} Comments`,
        inline: true,
      },
      {
        name: "Deleted",
        value:
          post.deleted || post.removed
            ? post.removed
              ? "Removed by moderator"
              : "Yes"
            : "No",
        inline: true,
      },
      {
        name: "NSFW",
        value: post.nsfw ? "Yes" : "No",
        inline: true,
      },
    ]);

    if (post.removed) embed.setColor(0xff0000);

    try {
      embed.setImage(post.thumbnail_url || post.url || null);
    } catch (exc) {
      console.log(exc);
    }
    return embed;
  }

  static postReportToEmbed({
    post,
    post_creator,
    creator,
    counts,
    community,
    post_report,
  }: PostReportView) {
    const postEmbed = this.postToEmbed({
      post: post,
      creator: post_creator,
      counts: counts,
      community: community,
    });

    const embed = new EmbedBuilder()
      .setTitle("Post Report")
      .setAuthor({
        name: creator.name,
        iconURL: creator.avatar ? creator.avatar : undefined,
      })
      .setDescription(post_report.reason)
      .setTimestamp(new Date(post_report.published))
      .setFooter({
        text: `Reported in ${community.name}`,
        iconURL: community.icon ? `${community.icon}` : undefined,
      });

    return [embed, postEmbed];
  }

  static commentReportToEmbed({
    post,
    comment,
    comment_creator,
    creator,
    counts,
    community,
    comment_report,
  }: CommentReportView) {
    const commentEmbed = this.commentToEmbed({
      post: post,
      comment: comment,
      creator: comment_creator,
      counts: counts,
      community: community,
    });

    const embed = new EmbedBuilder()
      .setTitle("Comment Report")
      .setAuthor({
        name: creator.name,
        iconURL: creator.avatar ? creator.avatar : undefined,
      })
      .setDescription(comment_report.reason)
      .setTimestamp(new Date(comment_report.published))
      .setFooter({
        text: `Reported in ${community.name}`,
        iconURL: community.icon ? `${community.icon}` : undefined,
      });

    return [embed, commentEmbed];
  }

  static userToEmbed({
    counts,
    person,
    is_admin,
  }: {
    counts?: PersonAggregates;
    person: Person;
    is_admin?: boolean;
  }) {
    const embed = new EmbedBuilder()
      .setTitle("Person Detail")
      .setDescription(person.bio || "**User has no Bio**")
      .setAuthor({
        name: person.local
          ? person.name
          : getActorId(
              extractInstanceFromActorId(person.actor_id),
              person.name
            ),
        iconURL: person.avatar ? person.avatar : undefined,
      })
      .setTimestamp(new Date(person.published))
      .addFields([
        { name: "ID", value: String(person.id), inline: true },
        { name: "Admin", value: is_admin ? "Yes" : is_admin === undefined ? "Unknown" : "No", inline: true },
      ])
      .setURL(
        `${instanceUrl}/u/${
          person.local
            ? person.name
            : getActorId(
                extractInstanceFromActorId(person.actor_id),
                person.name
              )
        }`
      )
      .setFooter({
        text: `User`,
      });

    if (counts) {
      embed.addFields([
        { name: "Posts", value: String(counts.post_count), inline: true },
        { name: "Comments", value: String(counts.comment_count), inline: true },

      ]);
    }

    return embed;
  }
}

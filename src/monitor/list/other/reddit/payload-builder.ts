import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";

import config from "#data/other/reddit/payload-config.json" with { type: "json" };
import { type Payload } from "#utils/message.js";
import { formatTimestamp } from "#utils/time.js";

import { type RedditPost } from "./monitor.js";

export function buildNewPostPayload(subredditName: string, post: RedditPost): Payload {
  const embed = new EmbedBuilder()
    .setColor(Number(config.color))
    .setDescription(`🟠 **NEW REDDIT POST · r/${subredditName}**` + `\n## ${post.title}`)
    .addFields(
      {
        name: "Author",
        value: post.author,
        inline: true,
      },
      {
        name: "Posted",
        value: formatTimestamp(post.timestamp),
        inline: true,
      },
    )
    .setFooter({
      text: "Reddit Monitor",
    });

  const linkButton = new ButtonBuilder()
    .setLabel("View post on Reddit")
    .setStyle(ButtonStyle.Link)
    .setURL(post.link)
    .setEmoji("🔗");

  const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(linkButton);

  return {
    embeds: [embed],
    components: [actionRow],
  };
}

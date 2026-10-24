// Held-tool policy text, fetched with plain curl on 24 Oct 2026 and cleaned
// with cleanHtmlToText. Imported as raw strings via Vite's ?raw so the test
// stays free of Node APIs (the backend tsconfig targets Workers types only).
import ahrefs from "./ahrefs.txt?raw";
import buffer from "./buffer.txt?raw";
import characterai from "./characterai.txt?raw";
import deepseek from "./deepseek.txt?raw";
import invideo from "./invideo.txt?raw";
import kling from "./kling.txt?raw";
import mailchimp from "./mailchimp.txt?raw";
import pictory from "./pictory.txt?raw";
import pika from "./pika.txt?raw";
import poe from "./poe.txt?raw";
import removebg from "./removebg.txt?raw";
import suno from "./suno.txt?raw";
import zapier from "./zapier.txt?raw";

export const HELD_FIXTURES: Record<string, string> = {
  ahrefs, buffer, characterai, deepseek, invideo, kling, mailchimp, pictory, pika, poe, removebg, suno, zapier,
};

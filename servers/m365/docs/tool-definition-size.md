# Tool definition size

Every tool definition (name, description and input schema, as `tools/list` serves it) is sent to the model
on every request. Live evidence: on a 129,200-token model the host reported instruction tokens of 163,913
(tools 156,182 for 64 tools, 45 of them these M365 tools at about 143k) and left nothing for messages, so the
user saw "Your messages do not fit in the current context window".

Sizes below are tokens for the local tool set (`docs/enabled-tools.local.txt`, 46 tools, views on, over
HTTP), estimated as characters / 4 times 1.4. The 1.4 is measured: the host's tokenizer counted 143k for the
same definitions that are 103k by characters / 4.

- **Budget:** at most 600 tokens for any one tool and 25,000 for the set, for this set and for the documented
  51-tool set with the channel tools. `test/tool-definition-budget.test.ts` fails the gate when either is
  exceeded.
- **Compact definitions are on by default over HTTP.** `MS365_MCP_TOOL_DEFINITION_BUDGET` is the per-tool
  schema ration in bytes (default 1400 over HTTP; `0` or `off` turns compact definitions off; stdio is
  unchanged unless it is set).
- Compact means: a description cut at a sentence to about 200 characters plus one short tip (`shortTip`, or
  the tip cut to about 220), one line for each OData parameter (`select`, `filter`, `orderby`, `top`,
  `search`, `expand`, `skiptoken` ...), the request body as a one-line field list (`bodySpec` in
  `endpoints.json`) instead of the generated schema, and no `skip`, `count`, `fetchAllPages`,
  `includeHeaders`, `excludeResponse` or `expandExtendedProperties` in the advertised schema. Those are still
  accepted (the schema is loose) and the interactive views call tools by role, so nothing they send changed.
- Print the table: `npm run tools:size` (`-- --all` for every tool, `-- --markdown` for before and after).

| Tool                              | Before (tokens) | After (tokens) |
| --------------------------------- | --------------: | -------------: |
| get-calendar-view                 |            1718 |            597 |
| list-mail-messages                |            1682 |            591 |
| list-contact-folder-contacts      |            1349 |            583 |
| read-mail-text                    |             910 |            571 |
| list-chat-messages                |            1390 |            566 |
| list-mail-folder-messages         |            1674 |            558 |
| list-folder-files                 |            1332 |            556 |
| search-onedrive-files             |            1297 |            546 |
| list-calendar-events              |            1417 |            534 |
| list-outlook-contacts             |            1197 |            523 |
| compose-calendar-event            |             519 |            519 |
| list-chats                        |            1262 |            511 |
| compose-chat-message              |             505 |            505 |
| list-relevant-people              |            1290 |            496 |
| create-calendar-event             |            5949 |            473 |
| list-todo-tasks                   |            1059 |            471 |
| list-chat-message-replies         |            1242 |            465 |
| list-mail-folders                 |            1248 |            464 |
| create-reply-all-draft            |            4475 |            451 |
| create-reply-draft                |            4433 |            440 |
| update-calendar-event             |            5887 |            437 |
| send-chat-message                 |           17085 |            399 |
| update-todo-task                  |            5653 |            387 |
| get-drive-item                    |             924 |            381 |
| get-mail-message                  |             771 |            374 |
| reply-to-chat-message             |           17115 |            373 |
| create-todo-task                  |            5526 |            368 |
| decline-calendar-event            |            1001 |            362 |
| create-onedrive-folder            |           16925 |            358 |
| create-draft-email                |            3969 |            357 |
| tentatively-accept-calendar-event |            1041 |            352 |
| get-calendar-event                |             939 |            349 |
| create-forward-draft              |            4208 |            345 |
| move-mail-message                 |             551 |            340 |
| move-rename-onedrive-item         |           16909 |            334 |
| get-outlook-contact               |             720 |            332 |
| get-chat-message                  |             771 |            329 |
| get-current-user                  |             824 |            327 |
| send-draft-message                |             603 |            327 |
| delete-calendar-event             |             559 |            325 |
| update-mail-message               |            3937 |            308 |
| accept-calendar-event             |             552 |            305 |
| list-todo-task-lists              |             595 |            293 |
| get-chat                          |             677 |            291 |
| delete-mail-message               |             507 |            272 |
| delete-onedrive-file              |             517 |            233 |
| **Total (46 tools)**              |      **144714** |      **19278** |

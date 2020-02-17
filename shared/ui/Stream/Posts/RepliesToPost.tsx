import styled from "styled-components";
import cx from "classnames";
import { useDispatch, useSelector } from "react-redux";
import { CodeStreamState } from "@codestream/webview/store";
import { getThreadPosts } from "@codestream/webview/store/posts/reducer";
import { getTeamMates, findMentionedUserIds } from "@codestream/webview/store/users/reducer";
import React from "react";
import { createPost, deletePost } from "../actions";
import { replaceHtml } from "@codestream/webview/utils";
import { PostPlus } from "@codestream/protocols/agent";
import { confirmPopup } from "../Confirm";
import { Reply } from "./Reply";
import Menu from "../Menu";
import MessageInput from "../MessageInput";
import Button from "../Button";
import { groupBy } from "lodash-es";

const ComposeWrapper = styled.div.attrs(() => ({
	className: "compose codemark-compose"
}))`
	&&& {
		padding: 0 !important;
	}
`;

const InlineMessageContainer = styled.div`
	padding: 0 25px !important;
	margin-top: -15px; // need to make up for the bottom margin from the preceding reply
`;

export const RepliesToPostContext = React.createContext({ setReplyingToPostId(postId: string) {} });

export const RepliesToPost = (props: { streamId: string; parentPostId: string }) => {
	const dispatch = useDispatch();
	const currentUserId = useSelector((state: CodeStreamState) => state.session.userId!);
	const replies = useSelector((state: CodeStreamState) =>
		getThreadPosts(state, props.streamId, props.parentPostId)
	);
	const nestedRepliesByParent = React.useMemo(() => {
		const nestedReplies = replies.filter(r => r.parentPostId !== props.parentPostId);
		return groupBy(nestedReplies, "parentPostId");
	}, [replies]);
	const allUsers = useSelector((state: CodeStreamState) => state.users);
	const teamMates = useSelector((state: CodeStreamState) => getTeamMates(state));
	const [replyingToPostId, setReplyingToPostId] = React.useState<string | null>();
	const [newReplyText, setNewReplyText] = React.useState("");
	const [isLoading, setIsLoading] = React.useState(false);

	const contextValue = React.useMemo(
		() => ({ setReplyingToPostId: setReplyingToPostId as any }),
		[]
	);

	const submit = async () => {
		// don't create empty replies
		if (newReplyText.length === 0) return;

		setIsLoading(true);
		// ignore the typescript warning that `await` isn't necessary below
		await dispatch(
			createPost(
				props.streamId,
				replyingToPostId!,
				replaceHtml(newReplyText)!,
				null,
				findMentionedUserIds(teamMates, newReplyText)
			)
		);
		setIsLoading(false);
		setNewReplyText("");
		setReplyingToPostId(undefined);
	};

	const getMenuItems = (reply: PostPlus) => {
		const menuItems: any[] = [];

		menuItems.push({ label: "Reply", key: "reply", action: () => setReplyingToPostId(reply.id) });
		if (reply.creatorId === currentUserId) {
			menuItems.push({
				label: "Delete",
				key: "delete",
				action: () => {
					confirmPopup({
						title: "Are you sure?",
						message: "Deleting a post cannot be undone.",
						centered: true,
						buttons: [
							{ label: "Go Back", className: "control-button" },
							{
								label: "Delete Post",
								className: "delete",
								wait: true,
								action: () => {
									dispatch(deletePost(reply.streamId, reply.id));
								}
							}
						]
					});
				}
			});
		}

		return menuItems;
	};

	return (
		<RepliesToPostContext.Provider value={contextValue}>
			{replies.map(reply => {
				const menuItems = getMenuItems(reply as any);
				return (
					<React.Fragment key={reply.id}>
						<Reply
							author={allUsers[reply.creatorId]}
							post={reply as any}
							nestedReplies={nestedRepliesByParent[reply.id] as any}
							renderMenu={(target, close) => (
								<Menu target={target} action={close} items={menuItems} />
							)}
						/>
						{reply.id === replyingToPostId && (
							<InlineMessageContainer>
								<ComposeWrapper>
									<MessageInput text={newReplyText} onChange={setNewReplyText} autoFocus />
								</ComposeWrapper>
								<div style={{ display: "flex", justifyContent: "flex-end" }}>
									<Button
										className="control-button cancel"
										style={{
											// fixed width to handle the isLoading case
											width: "80px",
											margin: "10px 10px"
										}}
										onClick={() => {
											setReplyingToPostId(undefined);
											setNewReplyText("");
										}}
									>
										Cancel
									</Button>
									<Button
										style={{
											// fixed width to handle the isLoading case
											width: "80px",
											margin: "10px 0"
										}}
										className={cx("control-button", { cancel: newReplyText.length === 0 })}
										type="submit"
										disabled={newReplyText.length === 0}
										onClick={submit}
										loading={isLoading}
									>
										Submit
									</Button>
								</div>
							</InlineMessageContainer>
						)}
					</React.Fragment>
				);
			})}
		</RepliesToPostContext.Provider>
	);
};

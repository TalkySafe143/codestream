import React, { useCallback, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { HostApi } from "../webview-api";
import {
	GetReposScmRequestType,
	ReposScm,
	UpdateTeamRequestType,
	UpdateTeamSettingsRequestType
} from "@codestream/protocols/agent";
import { Button } from "../src/components/Button";
import { Dialog, ButtonRow } from "../src/components/Dialog";
import { Link } from "./Link";
import { Checkbox } from "../src/components/Checkbox";
import styled from "styled-components";
import { closeModal } from "./actions";
import { CodeStreamState } from "../store";
import { isFeatureEnabled } from "../store/apiVersioning/reducer";
import { Radio, RadioGroup } from "../src/components/RadioGroup";
import { InlineMenu } from "../src/components/controls/InlineMenu";
import { logError } from "../logger";
import { TextInput } from "../Authentication/TextInput";
import Icon from "./Icon";
import { isConnected } from "../store/providers/reducer";
import { PROVIDER_MAPPINGS } from "./CrossPostIssueControls/types";
import { SmartFormattedList } from "./SmartFormattedList";
import { useDidMount } from "../utilities/hooks";
import { mapFilter } from "@codestream/webview/utils";

const Form = styled.form`
	h3 {
		margin: 0;
		color: var(--text-color-highlight);
	}
	b {
		color: var(--text-color-highlight);
	}
	a .icon {
		display: inline-block;
		margin-left: 5px;
		color: var(--text-color-subtle);
	}
	input[type="text"] {
		margin-top: 5px;
	}
`;

const PreConfigure = styled.div`
	display: flex;
	align-items: center;
	margin: 10px 0 0 0;
`;

const HR = styled.div`
	border-top: 1px solid var(--base-border-color);
	margin: 20px -20px;
`;

interface Props {
	onClose: Function;
}

const isNotEmpty = s => s.length > 0;

const CODE_HOSTS = [
	"github",
	"github_enterprise",
	"bitbucket",
	"bitbucket_server",
	"gitlab",
	"gitlab_enterprise"
];

const EMPTY_ARRAY = [];
const EMPTY_HASH = {};

interface PickerProps {
	key: string;
	defaultOnOff: boolean;
	defaultValues: {
		[id: string]: boolean;
	};
}
export function ProviderPicker(PickerProps) {}

export function TeamSetup(props: Props) {
	const dispatch = useDispatch();
	const derivedState = useSelector((state: CodeStreamState) => {
		const { providers } = state;
		const team = state.teams[state.context.currentTeamId];
		const teamSettings = team.settings ? team.settings : EMPTY_HASH;
		const user = state.users[state.session.userId!];

		const connectedProviders = Object.keys(providers).filter(id => isConnected(state, { id }));
		const codeHostProviders = Object.keys(providers).filter(id =>
			CODE_HOSTS.includes(providers[id].name)
		);
		const issueProviders = Object.keys(providers)
			.filter(id => providers[id].hasIssues)
			.filter(id => !CODE_HOSTS.includes(id));
		const messagingProviders = Object.keys(providers).filter(id => providers[id].hasSharing);

		const connected = id => connectedProviders.includes(id);

		const limitAuthentication = team.settings ? team.settings.limitAuthentication : false;
		const limitCodeHost = team.settings ? team.settings.limitCodeHost : false;
		const limitMessaging = team.settings ? team.settings.limitMessaging : false;
		const limitIssues = team.settings ? team.settings.limitIssues : false;

		const authenticationSettings = {};
		const teamAuthenticationSettings = teamSettings["authenticationProviders"] || {};
		codeHostProviders.forEach(id => {
			if (providers[id].forEnterprise || providers[id].isEnterprise) return;
			authenticationSettings[id] = limitAuthentication
				? teamAuthenticationSettings[id]
				: connected(id);
		});
		authenticationSettings["email"] = limitAuthentication
			? teamAuthenticationSettings["email"]
			: true;

		const codeHostSettings = {};
		const teamCodeHostSettings = teamSettings["codeHostProviders"] || {};
		codeHostProviders.forEach(id => {
			codeHostSettings[id] = limitCodeHost ? teamCodeHostSettings[id] : connected(id);
		});

		const messagingSettings = {};
		const teamMessagingSettings = teamSettings["messagingProviders"] || {};
		messagingProviders.forEach(id => {
			messagingSettings[id] = limitMessaging ? teamMessagingSettings[id] : connected(id);
		});

		const issuesSettings = {};
		const teamIssuesSettings = teamSettings["issuesProviders"] || {};
		issueProviders.forEach(id => {
			issuesSettings[id] = limitIssues ? teamIssuesSettings[id] : connected(id);
		});

		return {
			webviewFocused: state.context.hasFocus,
			providers,

			codeHostProviders,
			issueProviders,
			messagingProviders,
			connectedProviders,

			limitAuthentication,
			limitCodeHost,
			limitMessaging,
			limitIssues,

			authenticationSettings,
			codeHostSettings,
			messagingSettings,
			issuesSettings,

			currentTeam: team,
			currentUser: user,
			currentTeamId: state.context.currentTeamId,
			serverUrl: state.configs.serverUrl,
			company: state.companies[team.companyId] || {},
			team,
			xray: team.settings ? team.settings.xray : "on",
			multipleReviewersApprove: isFeatureEnabled(state, "multipleReviewersApprove"),
			repos: state.repos
		};
	});
	const { team, providers } = derivedState;

	const [isLoading, setIsLoading] = useState(false);
	const [recommended, setRecommended] = useState(true);
	const [configure, setConfigure] = useState(true);
	const [teamName, setTeamName] = useState(derivedState.team.name);
	const [teamNameValidity, setTeamNameValidity] = useState(true);
	const [limitAuthenticationField, setLimitAuthenticationField] = useState(
		derivedState.limitAuthentication
	);
	const [limitCodeHostField, setLimitCodeHostField] = useState(derivedState.limitCodeHost);
	const [limitMessagingField, setLimitMessagingField] = useState(derivedState.limitMessaging);
	const [limitIssuesField, setLimitIssuesField] = useState(derivedState.limitIssues);
	const [xray, setXray] = useState(derivedState.xray);
	const [openRepos, setOpenRepos] = useState<ReposScm[]>(EMPTY_ARRAY);
	const [unexpectedError, setUnexpectedError] = useState(false);
	const [authenticationProvidersField, setAuthenticationProvidersField] = useState({
		...derivedState.authenticationSettings
	});
	const [codeHostProvidersField, setCodeHostProvidersField] = useState({
		...derivedState.codeHostSettings
	});
	const [messagingProvidersField, setMessagingProvidersField] = useState({
		...derivedState.messagingSettings
	});
	const [issuesProvidersField, setIssuesProvidersField] = useState({
		...derivedState.issuesSettings
	});

	const fetchOpenRepos = async () => {
		const response = await HostApi.instance.send(GetReposScmRequestType, {
			inEditorOnly: true,
			includeCurrentBranches: true,
			includeProviders: true
		});
		if (response && response.repositories) {
			setOpenRepos(response.repositories);
		}
	};

	useDidMount(() => {
		fetchOpenRepos();
		HostApi.instance.track("TeamSetup Rendered", {});
	});

	const authenticationItems = mapFilter(derivedState.codeHostProviders, id => {
		const label = PROVIDER_MAPPINGS[providers[id].name].displayName;
		if (providers[id].forEnterprise || providers[id].isEnterprise) return;
		return {
			key: id,
			label,
			checked: authenticationProvidersField[id],
			action: () =>
				setAuthenticationProvidersField({
					...authenticationProvidersField,
					[id]: !authenticationProvidersField[id]
				})
		};
	});
	authenticationItems.push({
		key: "email",
		label: "Email/Password",
		checked: authenticationProvidersField["email"],
		action: () =>
			setAuthenticationProvidersField({
				...authenticationProvidersField,
				email: !authenticationProvidersField["email"]
			})
	});

	const authenticationLabels = derivedState.codeHostProviders
		.filter(id => authenticationProvidersField[id])
		.map(id => PROVIDER_MAPPINGS[providers[id].name].displayName);
	if (authenticationProvidersField["email"]) authenticationLabels.push("Email/Password");
	const authenticationLabel = (
		<SmartFormattedList
			value={authenticationLabels.length === 0 ? ["None"] : authenticationLabels}
		></SmartFormattedList>
	);

	const codeHostItems = derivedState.codeHostProviders.map(id => {
		const label = PROVIDER_MAPPINGS[providers[id].name].displayName;
		return {
			key: id,
			label,
			checked: codeHostProvidersField[id],
			action: () =>
				setCodeHostProvidersField({
					...codeHostProvidersField,
					[id]: !codeHostProvidersField[id]
				})
		};
	});
	const codeHostLabels = derivedState.codeHostProviders
		.filter(id => codeHostProvidersField[id])
		.map(id => PROVIDER_MAPPINGS[providers[id].name].displayName);
	const codeHostLabel = (
		<SmartFormattedList
			value={codeHostLabels.length === 0 ? ["None"] : codeHostLabels}
		></SmartFormattedList>
	);
	const messagingItems = derivedState.messagingProviders.map(id => {
		const label = PROVIDER_MAPPINGS[providers[id].name].displayName;
		return {
			key: id,
			label,
			checked: messagingProvidersField[id],
			action: () =>
				setMessagingProvidersField({
					...messagingProvidersField,
					[id]: !messagingProvidersField[id]
				})
		};
	});
	const messagingLabels = derivedState.messagingProviders
		.filter(id => messagingProvidersField[id])
		.map(id => PROVIDER_MAPPINGS[providers[id].name].displayName);
	const messagingLabel = (
		<SmartFormattedList
			value={messagingLabels.length === 0 ? ["None"] : messagingLabels}
		></SmartFormattedList>
	);

	const issueItems = derivedState.issueProviders.map(id => {
		const label = PROVIDER_MAPPINGS[providers[id].name].displayName;
		return {
			key: id,
			label,
			checked: issuesProvidersField[id],
			action: () =>
				setIssuesProvidersField({
					...issuesProvidersField,
					[id]: !issuesProvidersField[id]
				})
		};
	});
	const issueLabels = derivedState.issueProviders
		.filter(id => issuesProvidersField[id])
		.map(id => PROVIDER_MAPPINGS[providers[id].name].displayName);
	const issueLabel = (
		<SmartFormattedList
			value={issueLabels.length === 0 ? ["None"] : issueLabels}
		></SmartFormattedList>
	);

	const changeXray = async value => {
		await HostApi.instance.send(UpdateTeamSettingsRequestType, {
			teamId: derivedState.team.id,
			settings: { xray: value }
		});
	};

	const onValidityChanged = useCallback((field: string, validity: boolean) => {
		switch (field) {
			case "teamName":
				setTeamNameValidity(validity);
				break;
			default: {
			}
		}
	}, []);

	const save = async (event: React.SyntheticEvent) => {
		setUnexpectedError(false);
		event.preventDefault();
		onValidityChanged("teamName", isNotEmpty(teamName));
		if (!teamNameValidity) return;

		setIsLoading(true);
		const teamId = derivedState.team.id;
		try {
			await HostApi.instance.send(UpdateTeamRequestType, {
				teamId,
				name: teamName
			});

			await HostApi.instance.send(UpdateTeamSettingsRequestType, {
				teamId,
				settings: {
					xray,
					limitAuthentication: limitAuthenticationField,
					limitCodeHost: limitCodeHostField,
					limitMessaging: limitMessagingField,
					limitIssues: limitIssuesField,
					authenticationProviders: limitAuthenticationField
						? { ...authenticationProvidersField }
						: {},
					codeHostProviders: limitCodeHostField ? { ...codeHostProvidersField } : {},
					messagingProviders: limitMessagingField ? { ...messagingProvidersField } : {},
					issuesProviders: limitIssuesField ? { ...issuesProvidersField } : {}
				}
			});

			HostApi.instance.track("teamSettings Changed", {});
			dispatch(closeModal());
		} catch (error) {
			logError(`Unexpected error during update team settings: ${error}`, { teamName });
			setUnexpectedError(true);
		}
		// @ts-ignore
		setIsLoading(false);
	};

	return [
		<Dialog title="" onClose={() => dispatch(closeModal())}>
			<Form className="standard-form">
				<fieldset className="form-body">
					<div id="controls">
						<h3>Team Name</h3>
						<TextInput
							name="teamName"
							autoFocus
							value={teamName}
							onChange={setTeamName}
							onValidityChanged={onValidityChanged}
							validate={isNotEmpty}
						/>
						<HR />
						<h3>Live View</h3>
						<p className="explainer">
							Share local coding changes with teammates
							<Link href="https://docs.codestream.com/userguide/features/myteam-section/">
								<Icon name="info" className="clickable" title="More info" />
							</Link>
						</p>
						<RadioGroup name="live-view" selectedValue={xray} onChange={value => setXray(value)}>
							<Radio value="on">Always On</Radio>
							<Radio value="off">Always Off</Radio>
							<Radio value="user">User Selectable</Radio>
						</RadioGroup>

						{/*
						<HR />
						<h3>VS Code Recommended Extensions</h3>
						<Checkbox
							name="recommend"
							checked={recommended}
							onChange={() => setRecommended(!recommended)}
						>
							Add CodeStream to <span className="monospace">extensions.json</span>
							<Link href="https://code.visualstudio.com/docs/editor/extension-gallery#_workspace-recommended-extensions">
								<Icon name="info" className="clickable" title="More info" />
							</Link>
						</Checkbox>
						*/}
						{openRepos && openRepos.length > 0 && (
							<>
								<HR />
								<h3>Auto-Add Teammates</h3>
								<p className="explainer">
									Add a <code>.codestream</code> file to your repo so when teammates install
									CodeStream they will be automatically added to your team
									<Link href="https://docs.codestream.com/userguide/features/myteam-section/">
										<Icon name="info" className="clickable" title="More info" />
									</Link>
								</p>
								{openRepos.map(repo => {
									const repoId = repo.id || "";
									// return {
									// 	icon: <Icon name={repo.id === currentRepoId ? "arrow-right" : "blank"} />,
									// 	label: derivedState.repos[repoId] ? derivedState.repos[repoId].name : repo.folder.name,
									// 	key: repo.id,
									// 	action: () => getBranches(repo.folder.uri)
									// };
									const repoName = derivedState.repos[repoId]
										? derivedState.repos[repoId].name
										: repo.folder.name;
									return (
										<Checkbox
											name="configure"
											checked={configure}
											onChange={() => setConfigure(!configure)}
										>
											Add people who open <b>{repoName}</b> to <b>{team.name}</b>
										</Checkbox>
									);
								})}
							</>
						)}
						<HR />
						<h3>Integration Options</h3>
						<p className="explainer">
							Streamline integrations for your teammates by limiting the options that CodeStream
							displays
							<Link href="https://docs.codestream.com/userguide/features/myteam-section/">
								<Icon name="info" className="clickable" title="More info" />
							</Link>
						</p>
						<PreConfigure>
							<Checkbox
								name="limit-authentication"
								checked={limitAuthenticationField}
								onChange={() => setLimitAuthenticationField(!limitAuthenticationField)}
							>
								Limit Authentication
								{limitAuthenticationField && (
									<>
										: <InlineMenu items={authenticationItems}>{authenticationLabel}</InlineMenu>
									</>
								)}
							</Checkbox>
						</PreConfigure>
						<PreConfigure>
							<Checkbox
								name="limit-code-host"
								checked={limitCodeHostField}
								onChange={() => setLimitCodeHostField(!limitCodeHostField)}
							>
								Specify Code Host
								{limitCodeHostField && (
									<>
										: <InlineMenu items={codeHostItems}>{codeHostLabel}</InlineMenu>
									</>
								)}
							</Checkbox>
						</PreConfigure>
						<PreConfigure>
							<Checkbox
								name="limit-messaging"
								checked={limitMessagingField}
								onChange={() => setLimitMessagingField(!limitMessagingField)}
							>
								Specify Messaging
								{limitMessagingField && (
									<>
										: <InlineMenu items={messagingItems}>{messagingLabel}</InlineMenu>
									</>
								)}
							</Checkbox>
						</PreConfigure>
						<PreConfigure>
							<Checkbox
								name="limit-issues"
								checked={limitIssuesField}
								onChange={() => setLimitIssuesField(!limitIssuesField)}
							>
								Specify Issues
								{limitIssuesField && (
									<>
										: <InlineMenu items={issueItems}>{issueLabel}</InlineMenu>
									</>
								)}
							</Checkbox>
						</PreConfigure>
					</div>
					<HR style={{ marginBottom: 0 }} />
					<ButtonRow>
						<Button variant="secondary" onClick={() => dispatch(closeModal())}>
							Cancel
						</Button>
						<Button onClick={save} isLoading={isLoading}>
							Save Team Settings
						</Button>
					</ButtonRow>
				</fieldset>
			</Form>
		</Dialog>,
		<div style={{ height: "40px" }}></div>
	];
}

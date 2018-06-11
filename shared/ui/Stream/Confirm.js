import React, { Component } from "react";
import ReactDOM from "react-dom";
import createClassString from "classnames";
import Button from "./Button";

export default class Confirm extends Component {
	constructor(props) {
		super(props);
		this.state = { selected: props.selected };
		this.el = document.createElement("div");
	}

	componentDidMount() {
		const modalRoot = document.getElementById("confirm-root");
		modalRoot.appendChild(this.el);
		modalRoot.classList.add("active");
	}

	componentWillUnmount() {
		this.closePopup();
	}

	closePopup = () => {
		const modalRoot = document.getElementById("confirm-root");
		modalRoot.classList.remove("active");
		// modalRoot.removeChild(this.el);
	};

	componentDidUpdate(prevProps, prevState) {
		if (this.state.closed && !prevState.closed) {
			this.closeMenu();
			this.props.action && this.props.action();
			return null;
		}
	}

	render() {
		const bodyClass = createClassString({
			"confirm-popup-body": true,
			centered: this.props.centered
		});
		return ReactDOM.createPortal(
			<div className="confirm-popup" ref={ref => (this._div = ref)}>
				<div className={bodyClass}>
					{this.props.title && <div className="confirm-title">{this.props.title}</div>}
					{this.props.message && <div className="confirm-message">{this.props.message}</div>}
					<div className="button-group">
						{this.props.buttons.map(button => {
							const buttonClass = createClassString({
								"control-button": true,
								cancel: !button.action
							});

							return (
								<Button
									className={buttonClass}
									onClick={e => {
										this.closePopup();
										button.action && button.action(e);
									}}
									key={button.label}
								>
									{button.label}
								</Button>
							);
						})}
					</div>
				</div>
			</div>,
			this.el
		);
	}
}

export const confirmPopup = properties => {
	const root = document.getElementById("confirm-root");
	root.classList.add("active");
	ReactDOM.render(<Confirm {...properties} />, root);
};

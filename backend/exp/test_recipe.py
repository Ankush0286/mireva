import asyncio
from pathlib import Path

from PIL import Image, ImageDraw

from app.db.session import session_factory
from app.modules.accounts.models import ConnectedAccount
from app.platforms.instagram.adapter import InstagramAdapter


def ensure_test_image() -> Path:
    media_dir = Path("storage/media").resolve()
    media_dir.mkdir(parents=True, exist_ok=True)
    test_img = media_dir / "test_post.png"

    if not test_img.exists():
        img = Image.new("RGB", (1080, 1080), color=(14, 58, 117))
        draw = ImageDraw.Draw(img)
        draw.rectangle([100, 100, 980, 980], outline=(255, 255, 255), width=8)
        draw.text((280, 500), "Mireva AI Test Post", fill=(255, 255, 255))
        draw.text((370, 560), "Automated Recipe Replay", fill=(148, 163, 184))
        img.save(test_img)
        print(f"Generated test image: {test_img}")

    return test_img


async def main():
    db = session_factory()
    adapter = None
    try:
        account = db.query(ConnectedAccount).filter(ConnectedAccount.platform == "instagram").first()
        if not account:
            print("❌ No Instagram account found in database.")
            return

        test_image = ensure_test_image()
        test_caption = "Testing automated recipe replay with Mireva! 🌸✨ #automation #ai"

        print("\n=======================================================")
        print(f"🎬 TESTING RECIPE REPLAY FOR @{account.handle}")
        print("=======================================================")
        print(f"• Media:   {test_image}")
        print(f"• Caption: {test_caption}")
        print("• Mode:    Headed Chrome (Browser will be visible)\n")

        adapter = InstagramAdapter(account=account, headless=False)

        print("🚀 Executing publish_post(). Watch your Chrome window...")
        result = await adapter.publish_post(
            content=test_caption,
            media_paths=[str(test_image)],
        )

        print("\n=======================================================")
        print("✅ SUCCESS! Post Published Successfully!")
        print(f"• Post ID:  {result.platform_post_id}")
        print(f"• Post URL: {result.platform_post_url}")
        print("=======================================================\n")

        print("Waiting 8 seconds before closing browser...")
        await asyncio.sleep(8)

    finally:
        if adapter:
            await adapter.close()
        db.close()


if __name__ == "__main__":
    asyncio.run(main())
